var Future = Npm.require('fibers/future');
var url = Npm.require('url');
var r = Npm.require('rethinkdb');

Rethink = {};
Rethink.r = r;

var rethinkUrl = process.env.RETHINK_URL;

var parsedConnectionUrl = url.parse(rethinkUrl || 'rethinkdb://localhost:28015/test');
var connection = r.connect({
  host: parsedConnectionUrl.hostname || 'localhost',
  port: parsedConnectionUrl.port || '28015',
  db: (parsedConnectionUrl.pathname || '/test').split('/')[1],
  authKey: (parsedConnectionUrl.query || {}).authKey
});

try {
  connection = wait(connection);
} catch (err) {
  throw new Error(
    "Error connecting to RethinkDB: " + err.message + "\n\n" +
    "Set the RETHINK_URL environment variable. Example: rethinkdb://localhost:28015/database?authKey=somekey"
  );
}
Rethink._connection = connection;

Rethink.Table = function (name, options) {
  var self = this;
  options = options || {};

  self.name = name;
  self._prefix = '/' + name + '/';
  self._dbConnection = options.dbConnection || connection;
  self._connection = options.connection || Meteor.server;

  Rethink.Table._checkName(name);

  // define an RPC end-point
  var methods = {};
  methods[self._prefix + 'run'] = function (builtQuery, generatedKeys) {
    function FakeQuery(serializedQuery) {
      this.parsed = serializedQuery;
      this.tt = this.parsed[0];
      this.queryString = ":(";
    }
    FakeQuery.prototype.build = function () { return this.parsed; };

    var f = new Future;
    self._dbConnection._start(new FakeQuery(builtQuery), f.resolver(), {});
    return f.wait();
  };
  self._connection.methods(methods);
};

Rethink.Table._checkName = function (name) {
  var tables = r.tableList().run(connection);
  if (tables.indexOf(name) === -1)
    throw new Error("The table '" + name + "' doesn't exist in your RethinkDB database.");
};

Rethink.Table.prototype._deregisterMethods = function () {
  var self = this;
  delete self._connection.method_handlers[self._prefix + 'run'];
};


///////////////////////////////////////////////////////////////////////////////
// Monkey-patching section
///////////////////////////////////////////////////////////////////////////////
var rdbvalProto = r.table('dummy').constructor.__super__.constructor.__super__;
var rMethods = Object.keys(rdbvalProto).filter(function (x) { return x !== 'constructor'; });

// Hacky monkey-patching
rMethods.forEach(function (method) {
  var original = rdbvalProto[method];
  rdbvalProto[method] = function () {
    var ret = original.apply(this, arguments);
    ret._connection = this._connection;
    ret._table = this._table;
    return ret;
  };

  rdbvalProto[method].displayName = 'monkey patched ' + method;

  Rethink.Table.prototype[method] = function () {
    var o = r.table(this.name);
    var ret = o[method].apply(o, arguments);
    ret._connection = this._dbConnection;
    ret._table = this;
    return ret;
  };
});

var rtermbaseProto = rdbvalProto.constructor.__super__;
// monkey patch `run()`
var originalRun = rtermbaseProto.run;
rtermbaseProto.run = function (conn) {
  var args = [].slice.call(arguments);
  if (! args[0])
    args[0] = this._connection;
  return wait(originalRun.apply(this, args));
};

var rdbopProto = r.table('dummy').get('dummy').constructor.__super__.constructor.__super__.constructor.prototype;
rMethods = Object.keys(rdbopProto).filter(function (x) { return x !== 'constructor'; });
rMethods.forEach(function (method) {
  var original = rdbopProto[method];
  rdbopProto[method] = function () {
    var ret = original.apply(this, arguments);
    ret._connection = this._connection;
    ret._table = this._table;
    return ret;
  };

  rdbopProto[method].displayName = 'monkey patched ' + method;
});

///////////////////////////////////////////////////////////////////////////////
// Extra cursor methods as syntactic sugar
///////////////////////////////////////////////////////////////////////////////
rtermbaseProto.fetch = function () {
  var self = this;
  return wait(self.run().toArray());
};

rtermbaseProto.observe = function (callbacks) {
  var cbs = {
    added: callbacks.added || function () {},
    changed: callbacks.changed || function () {},
    removed: callbacks.removed || function () {},
    error: callbacks.error || function (err) { throw err; }
  };

  var self = this;

  var initValuesFuture = new Future;
  var initializing = false;

  var stream = self.changes({ includeStates: true }).run();
  stream.each(function (err, notif) {
    if (err) {
      if (initValuesFuture.isResolved())
        cbs.error(err);
      else
        initValuesFuture.throw(err);
      return;
    }

    // handle state changes
    if (notif.state) {
      if (notif.state === 'ready') {
        if (initializing) {
          initValuesFuture.return();
        } else {
          initValuesFuture.throw(
            new Error(
              "Currently can only observe point queries and orderBy/limit queries. For example: Table.get(id); Table.orderBy({ index: 'id' }).limit(4)."));
        }
      } else if (notif.state === 'initializing') {
        initializing = true;
      }
      return;
    }

    if (notif.old_val === undefined && notif.new_val === null) {
      // nothing found
      return;
    }

    // at this point the notification has two fields: old_val and new_val

    if (! notif.old_val) {
      cbs.added(notif.new_val);
      return;
    }
    if (! notif.new_val) {
      cbs.removed(notif.old_val);
      return;
    }
    cbs.changed(notif.new_val, notif.old_val);
  });

  initValuesFuture.wait();

  return {
    stop: function () {
      wait(stream.close());
    }
  };
};

Rethink.Table.prototype._publishCursor = function (sub) {
  var self = this;
  return self.filter({})._publishCursor(sub);
};

rtermbaseProto._publishCursor = function (sub) {
  var self = this;

  try {
    Rethink.Table._publishCursor(self, sub, self._table.name);
  } catch (err) {
    sub.error(err);
  }
};

Rethink.Table._publishCursor = function (cursor, sub, tableName) {
  var observeHandle = cursor.observe({
    added: function (doc) {
      sub.added(tableName, doc.id, doc);
    },
    changed: function (newDoc, oldDoc) {
      var fields = diffObject(oldDoc, newDoc);
      sub.changed(tableName, newDoc.id, fields);
    },
    removed: function (doc) {
      sub.removed(tableName, doc.id);
    }
  });

  // We don't call sub.ready() here: it gets called in livedata_server, after
  // possibly calling _publishCursor on multiple returned cursors.

  // register stop callback (expects lambda w/ no args).
  sub.onStop(function () {
    observeHandle.stop();
  });
};

function diffObject (oldDoc, newDoc) {
  var diff = {};
  Object.keys(newDoc).forEach(function (property) {
    if (! EJSON.equals(oldDoc[property], newDoc[property]))
      diff[property] = newDoc[property];
  });
  Object.keys(oldDoc).forEach(function (property) {
    if (! newDoc.hasOwnProperty(property))
      diff[property] = undefined;
  });

  return diff;
}

function wait (promise) {
  var f = new Future;
  promise.then(function (res) {
    f.return(res);
  }, function (err) {
    f.throw(err);
  });

  return f.wait();
}


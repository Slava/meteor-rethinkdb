var r = Rethink.r;

var writeMethods = [
  'insert',
  'update',
  'replace',
  'delete'
];

var readMethods = [
  'get',
  'getAll',
  'between',
  'filter'
];

// Coarse-grained dependencies
var tableDeps = {};

Rethink.Table = function (name, options) {
  options = options || {};

  // Allow anonymous collections, but still give them some identifier
  this.name = name || Random.id();
  this._prefix = '/' + this.name + '/';
  // XXX a hacky dynamic variable that tracks if the following change is
  // triggered by a connection and not by a user
  this._localOnly = false;

  // anonymous collection
  if (! name || options.connection === null) {
    this._connection = null;
  } else if (options.connection)
    this._connection = options.connection;
  else if (Meteor.isClient)
    this._connection = Meteor.connection;
  else
    this._connection = Meteor.server;

  // create this table in reqlite
  _runQuery(r.tableCreate(name).build());

  // create a coarse-grained Tracker dependency for this table
  tableDeps[name] = new Tracker.Dependency();

  // create the RPC
  if (this._connection) {
    var runMethod = function (builtQuery, generatedKeys) {
      return _runQuery(builtQuery, generatedKeys);
    };
    var methods = {};
    methods[this._prefix + 'run'] = runMethod;
    this._connection.methods(methods);
  }

  // hook it up to the DDP connection
  this._registerStore();
};

Rethink.Table.prototype._registerStore = function () {
  var self = this;
  if (! self._connection || ! self._connection.registerStore)
    return;

  var ok = self._connection.registerStore(self.name, {
    beginUpdate: function (batchSize, reset) {
      console.log('begin update'); return;
      if (batchSize > 1 || reset)
        self._pauseObservers();
      if (reset) {
        self._localOnly = true;
        r.dropTable(self.name).run();
        self._localOnly = false;
      }
    },
    update: function (msg) {
      var id = msg.id;
      self._localOnly = true;
      var doc = self.get(id).run();
      self._localOnly = false;

      if (msg.msg === 'replace') {
        if (! msg.replace) {
          if (doc) {
            self._localOnly = true;
            self.get(id).delete().run();
            self._localOnly = false;
          }
        } else if (! doc) {
          self._localOnly = true;
          self.insert(msg.replace).run();
          self._localOnly = false;
        } else {
          self._localOnly = true;
          self.get(id).replace(msg.replace).run();
          self._localOnly = false;
        }
      } else if (msg.msg === 'added') {
        if (doc) {
          throw new Error("Expected not to find a document already present for an add");
        }

        var fields = msg.fields;
        fields.id = id;
        self._localOnly = true;
        self.insert(fields).run();
        self._localOnly = false;
      } else if (msg.msg === 'removed') {
        if (! doc)
          throw new Error("Expected to find a document already present for removed");
        self._localOnly = true;
        self.get(id).delete().run();
        self._localOnly = false;
      } else if (msg.msg === 'changed') {
        if (! doc)
          throw new Error("Expected to find a document to change");
        self._localOnly = true;
        self._localOnly = false;
        self.get(id).update(msg.fields).run();
      } else {
        throw new Error("I don't know how to deal with this message");
      }
    },
    endUpdate: function () {
      console.log('endupdate')
      return;
      self._resumeObservers();
    },
    saveOriginals: function () {
      var table = Rethink._reqliteDb.databases.test.tables[self.name];
      table.saveOriginals();
    },
    retrieveOriginals: function () {
      var table = Rethink._reqliteDb.databases.test.tables[self.name];
      return table.retrieveOriginals();
    }
  });

  if (! ok)
    throw new Error("There is already a table named '" + self.name + "'");
};

Rethink.Table.prototype._makeNewID = function () {
  var src = name ? DDP.randomStream('/collection/' + this.name) : Random;
  return src.id();
};

// a global reqlite database used as a cache
Rethink._reqliteDb = Rethink.reqlite.makeServer();

var runReqliteQuery = function (q, cb) {
  var generatedKeys = null;
  if (q._writeQuery) {
    // XXX this should be replaced with listening to change-feeds
    Meteor.defer(function () {
      tableDeps[q._table.name].changed();
    });
    if (q._insertDocs) {
      // generate ids on the client
      generatedKeys = [];
      for (var i in q._insertDocs) {
        if (! q._insertDocs[i].id) {
          var genId = q._table._makeNewID();
          q._insertDocs[i].id = Rethink.r(genId);
          generatedKeys.push(genId);
        }
      }
    }
  } else if (q._readQuery) {
    tableDeps[q._table.name].depend();
  }

  var builtQuery = q.build();

  if (! q._writeQuery || ! q._table._connection || q._table._localOnly)
    return _runQuery(builtQuery, generatedKeys);
  q._table._connection.apply(q._table._prefix + 'run', [builtQuery, generatedKeys], {returnStubValue: true}, cb);
};

var _runQuery = function (builtQuery, generatedKeys) {
  var response = Rethink._reqliteDb.runQuery(builtQuery);
  var protodef = Rethink.reqlite.protoDef;
  var protoResponseType = protodef.Response.ResponseType;

  switch (response.t) {
    // an error
    case protoResponseType.COMPILE_ERROR:
      throw mkErr(RqlCompileError, response);
    case protoResponseType.CLIENT_ERROR:
      throw mkErr(RqlClientError, response);
    case protoResponseType.RUNTIME_ERROR:
      throw mkErr(RqlRuntimeError, response);
    // success response
    case protoResponseType.SUCCESS_ATOM:
      response = mkAtom(response);
      if (generatedKeys)
        response.generated_keys = generatedKeys;
      return response;
    default:
      throw new Error('This response type is not implemented by the reqlite driver yet: ' + response.t);
  }
}

///////////////////////////////////////////////////////////////////////////////
// Monkey-patching section
///////////////////////////////////////////////////////////////////////////////
var propagateRetValue = function (ret, m) {
  var self = this;
  ret._writeQuery = self._writeQuery || writeMethods.indexOf(m) !== -1;
  ret._readQuery = self._readQuery || readMethods.indexOf(m) !== -1;
  ret._table = self._table;

  if (m === 'insert') {
    var docs = arguments[0].args[1].optargs;
    if (!(docs instanceof Array))
      docs = [docs];
    self._insertDocs = docs;
  }
  ret._insertDocs = self._insertDocs;
};

wrapCursorMethods(propagateRetValue);
wrapTableMethods(function (ret, m) {
  propagateRetValue.call(this, ret, m);
  ret._table = this;
}, Rethink.Table.prototype);

// monkey-patch `run()`
attachCursorMethod('run', function (cb) {
  return function () {
    return runReqliteQuery(this, cb);
  };
});

Rethink.Table.prototype.run = function (cb) {
  var q = r.table(this.name);
  q._table = this;
  q._writeQuery = false;
  q._readQuery = true;
  return runReqliteQuery(q, cb);
};

Rethink.Table.prototype.fetch = Rethink.Table.prototype.toArray = Rethink.Table.prototype.run;


// patch Reqlite's _saveOriginal to control the latency comp. cycle
Rethink.reqlite.Table.prototype._saveOriginal = function (id, oldVal) {
  if (! this._savedOriginals)
    return;
  if (this._savedOriginals.has(id))
    return;
  this._savedOriginals.set(id, oldVal);
};
Rethink.reqlite.Table.prototype.saveOriginals = function () {
  var self = this;
  if (self._savedOriginals)
    throw new Error("Called saveOriginals twice without retrieveOriginals");
  self._savedOriginals = new PkMap();
};
Rethink.reqlite.Table.prototype.retrieveOriginals = function () {
  var self = this;
  if (!self._savedOriginals)
    throw new Error("Called retrieveOriginals without saveOriginals");

  var originals = self._savedOriginals;
  self._savedOriginals = null;
  return originals;
};


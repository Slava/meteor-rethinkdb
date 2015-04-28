Rethink = {};

// generated from the driver
Rethink.r = ___Rethink_r___;
Rethink.reqlite = ___Rethink_reqlite___;
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
var tableCursor = r.table('dummy');
var rdbvalProto = tableCursor.constructor.__super__.constructor.__super__;

// all methods pass along the table reference and the Table class has all the
// methods as a raw table cursor.
for (var m in rdbvalProto) {
  (function (m) {
    if (! rdbvalProto.hasOwnProperty(m) || m === 'constructor')
      return;

    var propagateRetValue = function (ret, self) {
      ret._writeQuery = self._writeQuery || writeMethods.indexOf(m) !== -1;
      ret._readQuery = self._readQuery || readMethods.indexOf(m) !== -1;
      if (m === 'insert') {
        var docs = arguments[0].args[1].optargs;
        if (!(docs instanceof Array))
          docs = [docs];
        self._insertDocs = docs;
      }
      ret._insertDocs = self._insertDocs;
    };

    var original = rdbvalProto[m];
    rdbvalProto[m] = function () {
      var ret = original.apply(this, arguments);
      ret._table = this._table;
      propagateRetValue(ret, this);
      return ret;
    };
    Rethink.Table.prototype[m] = function () {
      var cursor = r.table(this.name);
      var ret = cursor[m].apply(cursor, arguments);
      ret._table = this;
      propagateRetValue(ret, this);
      return ret;
    };

    Rethink.Table.prototype[m].displayName = m + " on Rethink.Table";
  })(m);
}

Rethink.Table.prototype.run = function (cb) {
  var q = r.table(this.name);
  q._table = this;
  q._writeQuery = false;
  q._readQuery = true;
  return runReqliteQuery(q, cb);
};
Rethink.Table.prototype.fetch = Rethink.Table.prototype.toArray = Rethink.Table.prototype.run;

// monkey-patch `run()`
var rtermbaseProto = rdbvalProto.constructor.__super__;
rtermbaseProto.run = function (cb) {
  return runReqliteQuery(this, cb);
};


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

///////////////////////////////////////////////////////////////////////////////
// Utils
///////////////////////////////////////////////////////////////////////////////
function PkMap () { this._map = {}; this._ids = {}; };
var makeInternalPk = Rethink.reqlite.helper.makeInternalPk;
PkMap.prototype.has = function (id) {
  return this._map.hasOwnProperty(makeInternalPk(id));
};
PkMap.prototype.set = function (id, val) {
  this._map[makeInternalPk(id)] = val;
  this._ids[makeInternalPk(id)] = id;
};
PkMap.prototype.forEach = function (cb) {
  for (var key in this._map)
    if (this._map.hasOwnProperty(key)) {
      var val = this._map[key];
      var id = this._ids[key];
      cb(val, id);
    }
};

function mkErr (ErrClass, repsponse) {
  return new ErrClass(mkAtom(response), response.b);
}

function mkAtom (response) {
  return recursivelyConvertPseudotype(response.r[0]);
}

function recursivelyConvertPseudotype (obj) {
  if ((obj instanceof Array) || (typeof obj === 'object')) {
    for (var key in obj) {
      var value = obj[key];
      obj[key] = recursivelyConvertPseudotype(value);
    }
  }
  if (typeof obj === 'object')
    obj = convertPseudotype(obj);

  return obj;
}

function convertPseudotype (obj) {
  if (! obj) return obj;

  // copy-pasted from the driver (compiled coffee)
  var i, _i, _len, _ref, _results;
  switch (obj['$reql_type$']) {
    case 'TIME':
      switch (opts.timeFormat) {
        case 'native':
        case void 0:
          if (obj['epoch_time'] == null) {
            throw new err.RqlDriverError("pseudo-type TIME " + obj + " object missing expected field 'epoch_time'.");
          }
          return new Date(obj['epoch_time'] * 1000);
        case 'raw':
          return obj;
        default:
          throw new err.RqlDriverError("Unknown timeFormat run option " + opts.timeFormat + ".");
      }
      break;
    case 'GROUPED_DATA':
      switch (opts.groupFormat) {
        case 'native':
        case void 0:
          _ref = obj['data'];
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            i = _ref[_i];
            _results.push({
              group: i[0],
              reduction: i[1]
            });
          }
          return _results;
          break;
        case 'raw':
          return obj;
        default:
          throw new err.RqlDriverError("Unknown groupFormat run option " + opts.groupFormat + ".");
      }
      break;
    case 'BINARY':
      switch (opts.binaryFormat) {
        case 'native':
        case void 0:
          if (obj['data'] == null) {
            throw new err.RqlDriverError("pseudo-type BINARY object missing expected field 'data'.");
          }
          return new Buffer(obj['data'], 'base64');
        case 'raw':
          return obj;
        default:
          throw new err.RqlDriverError("Unknown binaryFormat run option " + opts.binaryFormat + ".");
      }
      break;
    default:
      return obj;
  }
}

// errors
// Generated by CoffeeScript 1.7.0
var RqlClientError, RqlCompileError, RqlDriverError, RqlQueryPrinter, RqlRuntimeError, RqlServerError,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

RqlDriverError = (function(_super) {
  __extends(RqlDriverError, _super);

  function RqlDriverError(msg) {
    this.name = this.constructor.name;
    this.msg = msg;
    this.message = msg;
    if (Error.captureStackTrace != null) {
      Error.captureStackTrace(this, this);
    }
  }

  return RqlDriverError;

})(Error);

RqlServerError = (function(_super) {
  __extends(RqlServerError, _super);

  function RqlServerError(msg, term, frames) {
    this.name = this.constructor.name;
    this.msg = msg;
    this.frames = frames.slice(0);
    if (term != null) {
      if (msg[msg.length - 1] === '.') {
        this.message = "" + (msg.slice(0, msg.length - 1)) + " in:\n" + (RqlQueryPrinter.prototype.printQuery(term)) + "\n" + (RqlQueryPrinter.prototype.printCarrots(term, frames));
      } else {
        this.message = "" + msg + " in:\n" + (RqlQueryPrinter.prototype.printQuery(term)) + "\n" + (RqlQueryPrinter.prototype.printCarrots(term, frames));
      }
    } else {
      this.message = "" + msg;
    }
    if (Error.captureStackTrace != null) {
      Error.captureStackTrace(this, this);
    }
  }

  return RqlServerError;

})(Error);

RqlRuntimeError = (function(_super) {
  __extends(RqlRuntimeError, _super);

  function RqlRuntimeError() {
    return RqlRuntimeError.__super__.constructor.apply(this, arguments);
  }

  return RqlRuntimeError;

})(RqlServerError);

RqlCompileError = (function(_super) {
  __extends(RqlCompileError, _super);

  function RqlCompileError() {
    return RqlCompileError.__super__.constructor.apply(this, arguments);
  }

  return RqlCompileError;

})(RqlServerError);

RqlClientError = (function(_super) {
  __extends(RqlClientError, _super);

  function RqlClientError() {
    return RqlClientError.__super__.constructor.apply(this, arguments);
  }

  return RqlClientError;

})(RqlServerError);

RqlQueryPrinter = (function() {
  var carrotMarker, carrotify, composeCarrots, composeTerm, joinTree;

  function RqlQueryPrinter() {}

  RqlQueryPrinter.prototype.printQuery = function(term) {
    var tree;
    tree = composeTerm(term);
    return joinTree(tree);
  };

  composeTerm = function(term) {
    var arg, args, key, optargs, _ref;
    args = (function() {
      var _i, _len, _ref, _results;
      _ref = term.args;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        arg = _ref[_i];
        _results.push(composeTerm(arg));
      }
      return _results;
    })();
    optargs = {};
    _ref = term.optargs;
    for (key in _ref) {
      if (!__hasProp.call(_ref, key)) continue;
      arg = _ref[key];
      optargs[key] = composeTerm(arg);
    }
    return term.compose(args, optargs);
  };

  RqlQueryPrinter.prototype.printCarrots = function(term, frames) {
    var tree;
    if (frames.length === 0) {
      tree = [carrotify(composeTerm(term))];
    } else {
      tree = composeCarrots(term, frames);
    }
    return (joinTree(tree)).replace(/[^\^]/g, ' ');
  };

  composeCarrots = function(term, frames) {
    var arg, args, frame, i, key, optargs, _ref;
    frame = frames.shift();
    args = (function() {
      var _i, _len, _ref, _results;
      _ref = term.args;
      _results = [];
      for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
        arg = _ref[i];
        if (frame === i) {
          _results.push(composeCarrots(arg, frames));
        } else {
          _results.push(composeTerm(arg));
        }
      }
      return _results;
    })();
    optargs = {};
    _ref = term.optargs;
    for (key in _ref) {
      if (!__hasProp.call(_ref, key)) continue;
      arg = _ref[key];
      if (frame === key) {
        optargs[key] = composeCarrots(arg, frames);
      } else {
        optargs[key] = composeTerm(arg);
      }
    }
    if (frame != null) {
      return term.compose(args, optargs);
    } else {
      return carrotify(term.compose(args, optargs));
    }
  };

  carrotMarker = {};

  carrotify = function(tree) {
    return [carrotMarker, tree];
  };

  joinTree = function(tree) {
    var str, term, _i, _len;
    str = '';
    for (_i = 0, _len = tree.length; _i < _len; _i++) {
      term = tree[_i];
      if (Array.isArray(term)) {
        if (term.length === 2 && term[0] === carrotMarker) {
          str += (joinTree(term[1])).replace(/./g, '^');
        } else {
          str += joinTree(term);
        }
      } else {
        str += term;
      }
    }
    return str;
  };

  return RqlQueryPrinter;

})();


var Future = Npm.require('fibers/future');
var url = Npm.require('url');
var r = Npm.require('rethinkdb');

Rethink = {};
Rethink.r = r;

var rethinkUrl = process.env.RETHINK_URL;
if (! rethinkUrl) {
  throw new Error("Set the RETHINK_URL environment variable. Example: rethinkdb://localhost:28015/database?authKey=somekey");
}

var parsedConnectionUrl = url.parse(rethinkUrl);
var connection = wait(r.connect({
  host: parsedConnectionUrl.hostname || 'localhost',
  port: parsedConnectionUrl.port || '28015',
  db: (parsedConnectionUrl.pathname || '/test').split('/')[1],
  authKey: (parsedConnectionUrl.query || {}).authKey
}));

var tables = wait(r.tableList().run(connection));

Rethink.Table = function (name, options) {
  var self = this;
  self.name = name;
  self._connection = connection || options.dbConnection;

  self._checkName();
};

Rethink.Table.prototype._checkName = function () {
  var self = this;
  if (tables.indexOf(self.name) === -1)
    throw new Error("The table '" + self.name + "' doesn't exist in your RethinkDB database.");
};

var rdbvalProto = r.table('dummy').constructor.prototype.constructor.__super__.constructor.__super__;
var rMethods = Object.keys(rdbvalProto).filter(function (x) { return x !== 'constructor'; });

// Hacky monkey-patching
rMethods.forEach(function (method) {
  var original = rdbvalProto[method];
  rdbvalProto[method] = function () {
    var ret = original.apply(this, arguments);
    ret._connection = this._connection;
    return ret;
  };

  rdbvalProto[method].displayName = 'monkey patched ' + method;

  Rethink.Table.prototype[method] = function () {
    var o = r.table(this.name);
    var ret = o[method].apply(o, arguments);
    ret._connection = this._connection;
    return ret;
  };
});

var rtermbaseProto = rdbvalProto.constructor.__super__;
// monkey patch `run()`
var originalRun = rtermbaseProto.run;
rtermbaseProto.run = function () {
  var args = [].slice.call(arguments);
  args.unshift(this._connection);
  return wait(originalRun.apply(this, args));
};

function wait (promise) {
  var f = new Future;
  promise.then(function (res) {
    f.return(res);
  }, function (err) {
    f.throw(err);
  });

  return f.wait();
}


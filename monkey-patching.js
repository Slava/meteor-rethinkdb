var r = Rethink.r;
var tableCursor = r.table('dummy');
var rdbvalProto = tableCursor.constructor.__super__.constructor.__super__;
var rdbopProto = r.table('dummy').get('dummy').constructor.__super__.constructor.__super__.constructor.prototype;
var rtermbaseProto = rdbvalProto.constructor.__super__;

wrapCursorMethods = function (f) {
  for (var m in rdbvalProto) {
    if (m !== 'constructor' && rdbvalProto.hasOwnProperty(m))
      wrapMethod(m, f, rdbvalProto);
  }
  for (var m in rdbopProto) {
    if (m !== 'constructor' && rdbopProto.hasOwnProperty(m))
      wrapMethod(m, f, rdbopProto);
  }
};

wrapTableMethods = function (f, proto) {
  for (var m in rdbvalProto) {
    if (m !== 'constructor' && rdbvalProto.hasOwnProperty(m))
      (function (m) {
        proto[m] = function () {
          var rt = r.table(this.name);
          var ret = rt[m].apply(rt, arguments);
          if (typeof ret === 'object' || typeof ret === 'function')
            f.call(this, ret, m);
          return ret;
        };
      })(m);
  }
};

attachCursorMethod = function (name, factory) {
  rdbopProto[name] = rdbvalProto[name] = factory(rtermbaseProto);
};

var wrapMethod = function (method, f, proto) {
  var original = proto[method];
  proto[method] = function () {
    var ret = original.apply(this, arguments);
    f.call(this, ret, method);
    return ret;
  };
  proto[method].displayName = 'monkey patched ' + method;
};


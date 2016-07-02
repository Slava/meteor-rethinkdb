PkMap = function () { this._map = {}; this._ids = {}; };
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

mkErr = function (ErrClass, response) {
  return new ErrClass(mkAtom(response), response.b);
}

mkAtom = function (response) {
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
  var opts = {};

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

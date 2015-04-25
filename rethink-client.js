Rethink = {};

// generated from the driver
Rethink.r = ___Rethink_r___;
Rethink.reqlite = ___Rethink_reqlite___;
var r = Rethink.r;

Rethink.Table = function (name, options) {
  this.name = name;
};

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

    var original = rdbvalProto[m];
    rdbvalProto[m] = function () {
      var ret = original.apply(this, arguments);
      ret._table = this._table;
      return ret;
    };
    Rethink.Table.prototype[m] = function () {
      var cursor = r.table(this.name);
      var ret = cursor[m].apply(cursor, arguments);
      ret._table = this;
      return ret;
    };
    Rethink.Table.prototype[m].displayName = m + " on Rethink.Table";
  })(m);
}



var e = {
  Table: require('reqlite/lib/table.js'),
  Database: require('reqlite/lib/database.js'),
  'Document': require('reqlite/lib/document.js'),
  Query: require('reqlite/lib/query.js'),
  protoDef: require('reqlite/lib/protodef.js'),
  makeServer: function () {
    return {
      databases: {
        'test': (new this.Database('test'))
      },
      version: e.protoDef.VersionDummy.Version.V0_4,
      protocol: e.protoDef.VersionDummy.Protocol.JSON,
      runQuery: function (q) {
        var self = this;
        var Tt = e.protoDef.Term.TermType;
        var Qt = e.protoDef.Query.QueryType;
        var extendedQuery = [Qt.START, q, {db:[Tt.DB, ["test"]]}];
        return new e.Query(self, extendedQuery).run();
      }
    };
  }
};

module.exports = e;


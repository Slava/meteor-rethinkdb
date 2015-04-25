module.exports = {
  Table: require('reqlite/lib/table.js'),
  Database: require('reqlite/lib/database.js'),
  'Document': require('reqlite/lib/document.js'),
  Query: require('reqlite/lib/query.js'),
  protoDef: require('reqlite/lib/protodef.js'),
  makeServer: function () {
    return {
      databases: {
        'test': (new this.Database('test'))
      }
    };
  }
};


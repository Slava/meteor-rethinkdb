var r = require('rethinkdb/ast');
var printQuery = require('rethinkdb/errors').printQuery;

r.buildQuery = function (query) {
  return query.build();
};

module.exports = r;


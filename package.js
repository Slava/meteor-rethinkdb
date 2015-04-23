Package.describe({
  name: 'rethink',
  version: '0.0.1',
  summary: 'RethinkDB support for Meteor.',
  documentation: null
});

Npm.depends({
  rethinkdb: '2.0.0'
});

Package.onUse(function(api) {
//  api.versionsFrom('1.1.0.2');
  api.addFiles('rethink.js', 'server');
  api.export('Rethink', 'server');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('rethink');
});

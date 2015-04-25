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
  api.addFiles([
    '_build/rethink-query-builder.js',
    '_build/rethink-reqlite.js',
    'rethink-client.js'
  ], 'client');

  api.export('Rethink');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('rethink');
});

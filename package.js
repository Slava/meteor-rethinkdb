Package.describe({
  name: 'simple:rethink',
  version: '0.0.1',
  summary: 'RethinkDB support for Meteor.',
  documentation: 'README.md'
});

Npm.depends({
  rethinkdb: '2.0.0'
});

Package.onUse(function(api) {
//  api.versionsFrom('1.1.0.2');
  api.use('tracker', 'client');
  api.use('random', 'client');
  api.use('ddp', 'client');

  api.addFiles([
    'init.js',
    'monkey-patching.js',
    'rethink.js'
  ], 'server');

  api.addFiles([
    '_build/rethink-query-builder.js',
    '_build/rethink-reqlite.js',
    'init.js',
    'monkey-patching.js',
    'rethink-client.js'
  ], 'client');

  api.export('Rethink');
});

Package.onTest(function(api) {
  api.use(['mike:mocha-package', 'practicalmeteor:chai']);
  api.use('simple:rethink');
  api.addFiles('tests/tests.js', 'server');
});

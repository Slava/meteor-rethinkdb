Rethink = {};

if (Meteor.isClient) {
  // generated from the driver
  Rethink.r = ___Rethink_r___;
  Rethink.reqlite = ___Rethink_reqlite___;
}

if (Meteor.isServer) {
  var r = Npm.require('rethinkdb');
  Rethink.r = r;
}


#RethinkDB integration for Meteor

```
meteor add simple:rethink
```

This packages aims to provide a first-class experience working with
[RethinkDB](https://rethinkdb.com) building full-stack real-time web and mobile
apps on the [Meteor](https://meteor.com) framework.

The goals and plans of this package:

- Raw access to RethinkDB on the server, no ORMs
- Client-side cache accessible with the RethinkDB query language (ReQL)
- Use Meteor's publications/subscriptions model
- Take advantage of Meteor's "Latency Compensation" propeties (optimistic
  client-side updates without waiting for a server to respond)
- User accounts stored in RethinkDB and not in MongoDB (in plans)




##Using the Package

Adding a package is as simple as running the following command in your app's
folder:

```
meteor add simple:rethink
```

The package will connect to a RethinkDB instance by looking at the `RETHINK_URL`
environment variable.

```
env RETHINK_URL=rethinkdb://user:password@hostname:port/database meteor run
```

If you have an instance of RethinkDB running locally on your development
computer, the package will automatically connect to it on `localhost:28015`.

###Tables

Declare a table connected to the database on the server and a client-side cache
on the client, (be sure that you have created the table in your database
before-hand):

```javascript
Players = Rethink.Table('players');
```

You can query the data using ReQL:

```javascript
console.log('Number of players:', Players.count().run());
console.log('All players:', Players.run().toArray());
```

There is a shortcut for fetching the documents without turning a cursor into an
array:

```javascript
console.log('All players:', Players.fetch());
```

For constructing more complex queries, you can use the `Rethink.r` namespace.

```javascript
var r = Rethink.r;

// Top Players
Players.orderBy(r.dsc('score')).limit(3).fetch();
```

##Package Development

Since the package relies on RethinkDB node driver and Reqlite to build the
package, make sure `npm` is available and ready for use. Then run the build
script:

```bash
./driver-source/build.sh
```

This script will output a built version of Reqlite and driver for the
client-side cache.

##Running tests

Build the package first, then run the tests.

```bash
./driver-source/build.sh
meteor test-packages --driver-package respondly:test-reporter
```


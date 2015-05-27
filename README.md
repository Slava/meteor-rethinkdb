# RethinkDB integration for Meteor

A full-stack RethinkDB integration with Meteor. With livequery,
publish/subscribe, latency compensation and client-side cache.

![](https://raw.githubusercontent.com/Slava/meteor-rethinkdb/master/img/rethink_cover.png)

## Intro

```
meteor add simple:rethink
```

Demo app: https://github.com/Slava/meteor-rethinkdb-demo

This packages aims to provide a first-class experience working with
[RethinkDB](http://rethinkdb.com) building full-stack real-time web and mobile
apps on the [Meteor](https://meteor.com) framework.

The goals and plans of this package:

- Raw access to RethinkDB on the server, no ORMs
- Client-side cache accessible with the RethinkDB query language (ReQL)
- Use Meteor's publications/subscriptions model
- Take advantage of Meteor's "Latency Compensation" propeties (optimistic client-side updates without waiting for the server to respond)
- User accounts stored in RethinkDB instead of MongoDB (planned)

1. [Using the package](#using-the-package)
  1. [Setup](#setup)
  1. [Tables](#tables)
  1. [Queries](#queries)
  1. [Publishing](#publishing)
1. [Package development](#package-development)
1. [Contributions](#contributions)

## Using the package

### Setup

Adding a package is as simple as running the following command in your Meteor
app's directory:

```
meteor add simple:rethink
```

The package will connect to a RethinkDB instance by looking at the `RETHINK_URL`
environment variable.

```
env RETHINK_URL=rethinkdb://user:password@hostname:port/database meteor run
```

If you have an instance of RethinkDB running locally on your development
computer, the package will automatically connect to the `test` db on `localhost:28015`.

To install and run RethinkDB on a Mac:

```
$ brew update
$ brew install rethinkdb
$ rethinkdb
```

Or [install on another OS](http://rethinkdb.com/docs/install/).

### Tables

When using `new Mongo.Collection('items')`, the collection is automatically
created in MongoDB if it does not exist. With RethinkDB, you must create the table
yourself beforehand. You can do so in the web UI:

[http://localhost:8080/#tables](http://localhost:8080/#tables)

Then declare the table:

```javascript
Players = new Rethink.Table('players');
```

### Queries

Query the data using the
[Javascript API](http://www.rethinkdb.com/api/javascript/) for [ReQL](http://rethinkdb.com/docs/introduction-to-reql/):

```javascript
console.log('Number of players:', Players.count().run());
console.log('All players:', Players.run().toArray());
console.log('Updating players:', Players.filter({team: 'Knicks'}).update({city: 'NYC'}).run());
```

`.fetch()` is a shortcut for `.run().toArray()`, fetching the documents without
turning the cursor into an array:

```javascript
console.log('All players:', Players.fetch());
```

Construct more complex queries with `Rethink.r`:

```javascript
var r = Rethink.r;

// Top Players
Players.orderBy(r.desc('score')).limit(3).fetch();
```

### Publishing

Currently, observations (the type of queries you return from publish functions)
can only be [point queries](http://www.rethinkdb.com/api/javascript/get/) (`.get(primaryKey)`) or orderBy & limit queries (`.orderBy({ index: 'id' }).limit(4)`).

## Package development

Since the package relies on the RethinkDB node driver and Reqlite to build the
package, make sure `npm` is available and ready for use. Then run the build
script:

```bash
./driver-source/build.sh
```

This script will output a built version of Reqlite and driver for the
client-side cache.

### Running tests

Build the package first, then run the tests.

```bash
./driver-source/build.sh
meteor test-packages --driver-package respondly:test-reporter
```


## Contributions

Currently this project is welcoming contributions to Reqlite, the mini-implementation of RethinkDB in browser that this package is using on the client-side for DB operations simulations. Also, this project would appreciate more tests testing out different commands.

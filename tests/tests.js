var r = Rethink.r;
var coll;
var testCollName = 'meteor_rethink_tests';

function setupCollection (done) {
  try {
    r.tableDrop(testCollName).run(Rethink._connection);
  } catch (err){}

  r.tableCreate(testCollName).run(Rethink._connection);
  coll = new Rethink.Table(testCollName);

  done();
}
function cleanupCollection (done) {
  r.tableDrop(testCollName).run(Rethink._connection);
  coll._deregisterMethods();
  done();
}

describe('Querying data from a table', function () {
  before(setupCollection);
  after(cleanupCollection);

  it('can insert data', function (done) {
    var ret = coll.insert({ name: 'Slava', age: 20 }).run();
    expect(ret).to.have.property('inserted').that.equals(1);
    expect(ret).to.have.property('replaced').that.equals(0);
    done();
  });

  it('can update data', function (done) {
    var doc = coll.filter({ name: 'Slava' }).fetch()[0];
    expect(doc).to.be.an('object');
    expect(doc.name).to.be.equals('Slava');

    coll.get(doc.id).update({
      age: r.row('age').add(1)
    }).run();

    doc = coll.filter({ name: 'Slava' }).fetch()[0];
    expect(doc).to.be.an('object');
    expect(doc.age).to.be.equals(21);

    done();
  });

  it('can delete data', function (done) {
    var doc = coll.filter({ name: 'Slava' }).fetch()[0];
    expect(coll.get(doc.id).delete().run().deleted).to.be.equal(1);
    done();
  });
});

describe('Observing a cursor', function () {
  before(setupCollection);
  after(cleanupCollection);

  var doneObserving;
  var messages;
  var h;

  before(function () {
    doneObserving = false;
    messages = [];
    h = null;
  });

  it('can start observing', function (done) {
    coll.insert({ obj: 1 }).run();

    h = coll.orderBy({index:'id'}).limit(100).observe({
      added: function (doc) {
        if (doneObserving) assert.fail('should not get notified after a stopped observe');
        messages.push(['a', doc]);
      },
      changed: function (newDoc, oldDoc) {
        if (doneObserving) assert.fail('should not get notified after a stopped observe');
        messages.push(['c', newDoc, oldDoc]);
      },
      removed: function (doc) {
        if (doneObserving) assert.fail('should not get notified after a stopped observe');
        messages.push(['r', doc]);
      }
    });

    done();
  });

  it('gets initial data set', function (done) {
    expect(messages).to.have.length(1);
    var m = messages.shift();
    expect(m[0]).to.be.equal('a');
    expect(m[1].obj).to.be.equal(1);
    done();
  });

  it('notices inserts', function (done) {
    finishObserve(function () {
      coll.insert({ obj: 2 }).run();
    });
    expect(messages).to.have.length(1);
    var m = messages.shift();
    expect(m[0]).to.be.equal('a');
    expect(m[1].obj).to.be.equal(2);
    done();
  });

  it('notices updates', function (done) {
    finishObserve(function () {
      coll.filter(r.row('obj').gt(1)).update({obj: r.row('obj').add(3)}).run();
    });
    expect(messages).to.have.length(1);
    var m = messages.shift();
    expect(m[0]).to.be.equal('c');
    expect(m[1].obj).to.be.equal(5);
    expect(m[2].obj).to.be.equal(2);
    done();
  });

  it('notices removes', function (done) {
    finishObserve(function () {
      coll.filter(r.row('obj').lt(3)).delete().run();
    });
    expect(messages).to.have.length(1);
    var m = messages.shift();
    expect(m[0]).to.be.equal('r');
    expect(m[1].obj).to.be.equal(1);
    done();
  });


  it('stops', function (done) {
    h.stop();
    doneObserving = true;
    done();
  });
});

describe('Observing a ordered limited cursor', function () {
  before(setupCollection);
  after(cleanupCollection);

  var doneObserving;
  var messages;
  var h;

  before(function (done) {
    messages = [];

    coll.insert({id:'b'}).run();
    coll.insert({id:'c'}).run();
    coll.insert({id:'d'}).run();
    h = coll.orderBy({index:'id'}).limit(2).observe({
      added: function (doc) { messages.push(['a', doc]); },
      changed: function (newDoc, oldDoc) { messages.push(['c', newDoc, oldDoc]); },
      removed: function (doc) { messages.push(['r', doc]); }
    });
    done();
  });
  after(function (done) {
    h.stop();
    done();
  });

  it('gets initial set', function (done) {
    expect(messages).to.have.length(2);
    var m;
    m = messages.shift();
    expect(m[0]).to.be.equal('a');
    expect(m[1].id).to.be.equal('b');
    m = messages.shift();
    expect(m[0]).to.be.equal('a');
    expect(m[1].id).to.be.equal('c');
    done();
  });

  it('correctly handles push-in/pull-out of a new member of limited set', function (done) {
    finishObserve(function () {
      coll.insert({
        id: 'a'
      }).run();
    });
    expect(messages).to.have.length(2);
    var m;
    m = messages.shift();
    expect(m[0]).to.be.equal('r');
    expect(m[1].id).to.be.equal('c');
    m = messages.shift();
    expect(m[0]).to.be.equal('a');
    expect(m[1].id).to.be.equal('a');
    done();
  });
});


function finishObserve (f) {
  var fence = new DDPServer._WriteFence;
  DDPServer._CurrentWriteFence.withValue(fence, f);
  fence.armAndWait();
};

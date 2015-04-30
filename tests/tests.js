var r = Rethink.r;
var coll;
var testCollName = 'meteor_rethink_tests';

describe('Querying data from a table', function () {
  before(function (done) {
    try {
      r.tableDrop(testCollName).run(Rethink._connection);
    } catch (err){}

    r.tableCreate(testCollName).run(Rethink._connection);
    coll = new Rethink.Table(testCollName);

    done();
  });

  after(function (done) {
    r.tableDrop(testCollName).run(Rethink._connection);
    coll._deregisterMethods();
    done();
  });

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


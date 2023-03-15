import { assert } from 'chai'
import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import async from 'async'
import { Collection } from '../../data/collection'
import { Persistence } from '../../data/persistence'
import { deserialize, serialize } from '../../data/serialization'
import { pluck } from '../../data/utils'

const testDb = 'workspace/test.db',
  reloadTimeUpperBound = 60 // In ms, an upper bound for the reload time used to check createdAt and updatedAt

describe.only('Database', function () {
  let collection: Collection

  beforeEach(async () => {
    collection = new Collection({ filename: testDb })
    collection.filename.should.equal(testDb)
    collection.inMemoryOnly.should.equal(false)

    await Persistence.ensureDirectoryExists(path.dirname(testDb))

    fs.existsSync(testDb) && fs.unlinkSync(testDb)

    await collection.loadDatabase()

    collection.getAllData().length.should.equal(0)
  })

  it('Constructor compatibility with v0.6-', function () {
    let dbef = new Collection('somefile')
    dbef.filename.should.equal('somefile')
    dbef.inMemoryOnly.should.equal(false)

    dbef = new Collection('')
    assert.isNull(dbef.filename)
    dbef.inMemoryOnly.should.equal(true)

    dbef = new Collection()
    assert.isNull(dbef.filename)
    dbef.inMemoryOnly.should.equal(true)
  })

  describe('Autoloading', function () {
    it('Can autoload a database and query it right away', async function () {
      const fileStr =
        serialize({ _id: '1', a: 5, planet: 'Earth' }) +
        '\n' +
        serialize({ _id: '2', a: 5, planet: 'Mars' }) +
        '\n'
      const autoDb = 'workspace/auto.db'
      fs.writeFileSync(autoDb, fileStr, 'utf8')

      const db = new Collection({ filename: autoDb, autoload: true })

      await db.waitFor('ready')

      const docs = await db.find({}).exec()

      docs.length.should.equal(2)
    })

    it('Throws if autoload fails', async () => {
      const fileStr =
          serialize({ _id: '1', a: 5, planet: 'Earth' }) +
          '\n' +
          serialize({ _id: '2', a: 5, planet: 'Mars' }) +
          '\n' +
          '{"$$indexCreated":{"fieldName":"a","unique":true}}',
        autoDb = 'workspace/auto.db'

      fs.writeFileSync(autoDb, fileStr, 'utf8')

      // Check the loadDatabase generated an error
      function onload(err) {
        err.errorType.should.equal('uniqueViolated')
      }

      const db = new Collection({
        filename: autoDb,
        autoload: true,
        onload: onload,
      })

      await db.find({}).exec()
    })
  })

  describe('Insert', function () {
    it('Able to insert a document in the database, setting an _id if none provided, and retrieve it even after a reload', async () => {
      let docs = await collection.find({}).exec()
      docs.length.should.equal(0)

      await collection.insert({ somedata: 'ok' })

      // The data was correctly updated
      docs = await collection.find({}).exec()
      docs.length.should.equal(1)
      Object.keys(docs[0]).length.should.equal(2)
      docs[0].somedata.should.equal('ok')
      assert.isDefined(docs[0]._id)

      // After a reload the data has been correctly persisted
      await collection.loadDatabase()
      docs = await collection.find({}).exec()
      docs.length.should.equal(1)
      Object.keys(docs[0]).length.should.equal(2)
      docs[0].somedata.should.equal('ok')
      assert.isDefined(docs[0]._id)
    })

    it('Can insert multiple documents in the database', async function () {
      const docs = await collection.find({}).exec()
      docs.length.should.equal(0)

      await collection.insert({ somedata: 'ok' })
      await collection.insert({ somedata: 'another' })
      await collection.insert({ somedata: 'again' })

      const newDocs = await collection.find({}).exec()
      newDocs.length.should.equal(3)
      pluck(newDocs, 'somedata').should.contain('ok')
      pluck(newDocs, 'somedata').should.contain('another')
      pluck(newDocs, 'somedata').should.contain('again')
    })

    it('Can insert and get back from DB complex objects with all primitive and secondary types', async function () {
      const da = new Date(),
        obj = { a: ['ee', 'ff', 42], date: da, subobj: { a: 'b', b: 'c' } }
      await collection.insert(obj)
      const res = await collection.findOne({})

      res.a.length.should.equal(3)
      res.a[0].should.equal('ee')
      res.a[1].should.equal('ff')
      res.a[2].should.equal(42)
      res.date.getTime().should.equal(da.getTime())
      res.subobj.a.should.equal('b')
      res.subobj.b.should.equal('c')
    })

    it('If an object returned from the DB is modified and refetched, the original value should be found', async function () {
      await collection.insert({ a: 'something' })
      let doc = await collection.findOne({})
      doc.a.should.equal('something')
      doc.a = 'another thing'
      doc.a.should.equal('another thing')

      // Re-fetching with findOne should yield the persisted value
      doc = await collection.findOne({})
      doc.a.should.equal('something')
      doc.a = 'another thing'
      doc.a.should.equal('another thing')

      // Re-fetching with find should yield the persisted value
      const docs = await collection.find({}).exec()
      docs[0].a.should.equal('something')
    })

    it('Cannot insert a doc that has a field beginning with a $ sign', async function () {
      await assert.isRejected(collection.insert({ $something: 'atest' }))
    })

    it('If an _id is already given when we insert a document, use that instead of generating a random one', async function () {
      const newDoc = await collection.insert({ _id: 'test', stuff: true })
      newDoc.stuff.should.equal(true)
      newDoc._id.should.equal('test')

      try {
        await collection.insert({ _id: 'test', otherstuff: 42 })
      } catch (err) {
        err.errorType.should.equal('uniqueViolated')
      }
    })

    it('Modifying the insertedDoc after an insert doesnt change the copy saved in the database', async function () {
      const newDoc = await collection.insert({ a: 2, hello: 'world' })
      newDoc.hello = 'changed'
      const doc = await collection.findOne({ a: 2 })
      doc.hello.should.equal('world')
    })

    it('Can insert an array of documents at once', async function () {
      const docs = [
        { a: 5, b: 'hello' },
        { a: 42, b: 'world' },
      ]

      await collection.remove({}, { multi: true })
      await collection.insert(docs)
      const foundDocs = await collection.find({}).exec()

      foundDocs.length.should.equal(2)
      _.find(foundDocs, function (doc) {
        return doc.a === 5
      }).b.should.equal('hello')
      _.find(foundDocs, function (doc) {
        return doc.a === 42
      }).b.should.equal('world')

      // The data has been persisted correctly
      const data = _.filter(
        fs.readFileSync(testDb, 'utf8').split('\n'),
        function (line) {
          return line.length > 0
        },
      )
      data.length.should.equal(2)
      deserialize(data[0]).a.should.equal(5)
      deserialize(data[0]).b.should.equal('hello')
      deserialize(data[1]).a.should.equal(42)
      deserialize(data[1]).b.should.equal('world')
    })

    it('If a bulk insert violates a constraint, all changes are rolled back', async function () {
      const docs = [
        { a: 5, b: 'hello' },
        { a: 42, b: 'world' },
        { a: 5, b: 'bloup' },
        { a: 7 },
      ]

      await collection.ensureIndex({ fieldName: 'a', unique: true })

      try {
        await collection.insert(docs)
      } catch (err) {
        err.errorType.should.equal('uniqueViolated')

        const docs = await collection.find().exec()

        // Datafile only contains index definition
        const datafileContents = deserialize(fs.readFileSync(testDb, 'utf8'))
        assert.deepEqual(datafileContents, {
          $$indexCreated: { fieldName: 'a', unique: true },
        })

        docs.length.should.equal(0)
      }
    })

    it('If timestampData option is set, a createdAt field is added and persisted', async function () {
      const newDoc = { hello: 'world' }
      const beginning = Date.now()
      collection = new Collection({
        filename: testDb,
        timestampData: true,
        autoload: true,
      })

      await collection.waitFor('ready')

      let docs = await collection.find({}).exec()
      docs.length.should.equal(0)

      const insertedDoc = await collection.insert(newDoc)
      assert.deepEqual(newDoc, { hello: 'world' })
      insertedDoc.hello.should.equal('world')
      assert.isDefined(insertedDoc.createdAt)
      assert.isDefined(insertedDoc.updatedAt)
      insertedDoc.createdAt.should.equal(insertedDoc.updatedAt)
      assert.isDefined(insertedDoc._id)
      Object.keys(insertedDoc).length.should.equal(4)
      assert.isBelow(
        Math.abs(insertedDoc.createdAt.getTime() - beginning),
        reloadTimeUpperBound,
      )

      insertedDoc.bloup = 'another'
      Object.keys(insertedDoc).length.should.equal(5)

      docs = await collection.find({}).exec()
      docs.length.should.equal(1)
      assert.deepEqual(newDoc, { hello: 'world' })
      assert.deepEqual(
        {
          hello: 'world',
          _id: insertedDoc._id,
          createdAt: insertedDoc.createdAt,
          updatedAt: insertedDoc.updatedAt,
        },
        docs[0],
      )

      await collection.loadDatabase()

      docs = await collection.find({}).exec()
      docs.length.should.equal(1)
      assert.deepEqual(newDoc, { hello: 'world' })
      assert.deepEqual(
        {
          hello: 'world',
          _id: insertedDoc._id,
          createdAt: insertedDoc.createdAt,
          updatedAt: insertedDoc.updatedAt,
        },
        docs[0],
      )
    })

    it("If timestampData option not set, don't create a createdAt and a updatedAt field", async function () {
      const insertedDoc = await collection.insert({ hello: 'world' })
      Object.keys(insertedDoc).length.should.equal(2)
      assert.isUndefined(insertedDoc.createdAt)
      assert.isUndefined(insertedDoc.updatedAt)

      const docs = await collection.find({}).exec()
      docs.length.should.equal(1)
      assert.deepEqual(docs[0], insertedDoc)
    })

    it("If timestampData is set but createdAt is specified by user, don't change it", async function () {
      const newDoc = { hello: 'world', createdAt: new Date(234) }
      const beginning = Date.now()
      collection = new Collection({
        filename: testDb,
        timestampData: true,
        autoload: true,
      })

      await collection.waitFor('ready')

      const insertedDoc = await collection.insert(newDoc)

      Object.keys(insertedDoc).length.should.equal(4)

      insertedDoc.createdAt.getTime().should.equal(234) // Not modified

      assert.isBelow(
        insertedDoc.updatedAt.getTime() - beginning,
        reloadTimeUpperBound,
      ) // Created

      const docs = await collection.find({}).exec()
      assert.deepEqual(insertedDoc, docs[0])

      await collection.loadDatabase()

      const reloadedDocs = await collection.find({}).exec()
      assert.deepEqual(insertedDoc, reloadedDocs[0])
    })

    it("If timestampData is set but updatedAt is specified by user, don't change it", async function () {
      const newDoc = { hello: 'world', updatedAt: new Date(234) },
        beginning = Date.now()

      collection = new Collection({
        filename: testDb,
        timestampData: true,
        autoload: true,
      })

      await collection.waitFor('ready')

      const insertedDoc = await collection.insert(newDoc)

      Object.keys(insertedDoc).length.should.equal(4)
      insertedDoc.updatedAt.getTime().should.equal(234) // Not modified
      assert.isBelow(
        insertedDoc.createdAt.getTime() - beginning,
        reloadTimeUpperBound,
      ) // Created

      const docs = await collection.find({}).exec()
      assert.deepEqual(insertedDoc, docs[0])

      await collection.loadDatabase()

      const updatedDocs = await collection.find({}).exec()
      assert.deepEqual(insertedDoc, updatedDocs[0])
    })

    it('Can insert a doc with id 0', async function () {
      const doc = await collection.insert({ _id: 0, hello: 'world' })
      doc._id.should.equal(0)
      doc.hello.should.equal('world')
    })
  })

  describe('#getCandidates', function () {
    it('Can use an index to get docs with a basic match', async function () {
      await collection.ensureIndex({ fieldName: 'tf' })
      const doc1 = await collection.insert({ tf: 4 })
      await collection.insert({ tf: 6 })
      const doc2 = await collection.insert({ tf: 4, an: 'other' })
      await collection.insert({ tf: 9 })

      const data = await collection.getCandidates({ r: 6, tf: 4 })
      const foundDoc1 = data.find(d => d._id === doc1._id)
      const foundDoc2 = data.find(d => d._id === doc2._id)

      assert.equal(data.length, 2)
      assert.deepEqual(foundDoc1, { _id: doc1._id, tf: 4 })
      assert.deepEqual(foundDoc2, { _id: doc2._id, tf: 4, an: 'other' })
    })

    it('Can use an index to get docs with a $in match', async function () {
      await collection.ensureIndex({ fieldName: 'tf' })

      await collection.insert({ tf: 4 })
      const doc1 = await collection.insert({ tf: 6 })
      await collection.insert({ tf: 4, an: 'other' })
      const doc2 = await collection.insert({ tf: 9 })

      const data = await collection.getCandidates({
        r: 6,
        tf: { $in: [6, 9, 5] },
      })

      const foundDoc1 = data.find(d => d._id === doc1._id)
      const foundDoc2 = data.find(d => d._id === doc2._id)

      data.length.should.equal(2)
      assert.deepEqual(foundDoc1, { _id: foundDoc1._id, tf: 6 })
      assert.deepEqual(foundDoc2, { _id: foundDoc2._id, tf: 9 })
    })

    it('If no index can be used, return the whole database', async function () {
      const _doc1 = await collection.insert({ tf: 4 })
      const _doc2 = await collection.insert({ tf: 6 })
      const _doc3 = await collection.insert({ tf: 4, an: 'other' })
      const _doc4 = await collection.insert({ tf: 9 })

      const data = await collection.getCandidates({
        r: 6,
        notf: { $in: [6, 9, 5] },
      })

      const doc1 = _.find(data, function (d) {
        return d._id === _doc1._id
      })
      const doc2 = _.find(data, function (d) {
        return d._id === _doc2._id
      })
      const doc3 = _.find(data, function (d) {
        return d._id === _doc3._id
      })
      const doc4 = _.find(data, function (d) {
        return d._id === _doc4._id
      })

      data.length.should.equal(4)
      assert.deepEqual(doc1, { _id: doc1._id, tf: 4 })
      assert.deepEqual(doc2, { _id: doc2._id, tf: 6 })
      assert.deepEqual(doc3, { _id: doc3._id, tf: 4, an: 'other' })
      assert.deepEqual(doc4, { _id: doc4._id, tf: 9 })
    })

    it('Can use indexes for comparison matches', async function () {
      await collection.ensureIndex({ fieldName: 'tf' })
      const doc1 = await collection.insert({ tf: 4 })
      const doc2 = await collection.insert({ tf: 6 })
      const doc3 = await collection.insert({ tf: 4, an: 'other' })
      const doc4 = await collection.insert({ tf: 9 })
      const data = await collection.getCandidates({
        r: 6,
        tf: { $lte: 9, $gte: 6 },
      })
      const foundDoc2 = _.find(data, function (d) {
        return d._id === doc2._id
      })
      const foundDoc4 = _.find(data, function (d) {
        return d._id === doc4._id
      })
      data.length.should.equal(2)
      assert.deepEqual(foundDoc2, { _id: doc2._id, tf: 6 })
      assert.deepEqual(foundDoc4, { _id: doc4._id, tf: 9 })
    })

    it('Can set a TTL index that expires documents', async function () {
      await collection.ensureIndex({
        fieldName: 'exp',
        expireAfterSeconds: 0.2,
      })
      await collection.insert({ hello: 'world', exp: new Date() })

      await new Promise(resolve => setTimeout(resolve, 100))

      let doc = await collection.findOne({})
      doc.hello.should.equal('world')

      await new Promise(resolve => setTimeout(resolve, 101))

      doc = await collection.findOne({})
      assert.isNull(doc)

      await collection.persistence.compactDatafile()

      // After compaction, no more mention of the document, correctly removed
      const datafileContents = fs.readFileSync(testDb, 'utf8')

      datafileContents.split('\n').length.should.equal(2)
      assert.isNull(datafileContents.match(/world/))

      // New datastore on same datafile is empty
      const d2 = new Collection({ filename: testDb, autoload: true })

      await d2.waitFor('ready')

      doc = await d2.findOne({})

      assert.isNull(doc)
    })

    it('TTL indexes can expire multiple documents and only what needs to be expired', async function () {
      await collection.ensureIndex({
        fieldName: 'exp',
        expireAfterSeconds: 0.2,
      })
      await collection.insert({ hello: 'world1', exp: new Date() })
      await collection.insert({ hello: 'world2', exp: new Date() })
      await collection.insert({
        hello: 'world3',
        exp: new Date(new Date().getTime() + 100),
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      let docs = await collection.find({}).exec()
      docs.length.should.equal(3)

      await new Promise(resolve => setTimeout(resolve, 101))

      docs = await collection.find({}).exec()
      docs.length.should.equal(1)
      docs[0].hello.should.equal('world3')

      await new Promise(resolve => setTimeout(resolve, 101))

      docs = await collection.find({}).exec()
      docs.length.should.equal(0)
    })

    it('Document where indexed field is absent or not a date are ignored', async function () {
      await collection.ensureIndex({
        fieldName: 'exp',
        expireAfterSeconds: 0.2,
      })

      await Promise.all([
        collection.insert({ hello: 'world1', exp: new Date() }),
        collection.insert({ hello: 'world2', exp: 'not a date' }),
        collection.insert({ hello: 'world3' }),
      ])

      await new Promise(resolve => setTimeout(resolve, 100))

      let docs = await collection.find().exec()
      docs.length.should.equal(3)

      await new Promise(resolve => setTimeout(resolve, 101))

      docs = await collection.find().exec()
      docs.length.should.equal(2)
      docs[0].hello.should.not.equal('world1')
      docs[1].hello.should.not.equal('world1')
    })
  })

  describe('Find', function () {
    it('Can find all documents if an empty query is used', async function () {
      await collection.insert({ somedata: 'ok' })
      await collection.insert({ somedata: 'another', plus: 'additional data' })
      await collection.insert({ somedata: 'again' })

      const docs = await collection.find({}).exec()
      docs.length.should.equal(3)
      pluck(docs, 'somedata').should.contain('ok')
      pluck(docs, 'somedata').should.contain('another')
      _.find(docs, function (d) {
        return d.somedata === 'another'
      }).plus.should.equal('additional data')
      pluck(docs, 'somedata').should.contain('again')
    })

    it('Can find all documents matching a basic query', async function () {
      await collection.insert({ somedata: 'ok' })
      await collection.insert({ somedata: 'again', plus: 'additional data' })
      await collection.insert({ somedata: 'again' })

      // Test with query that will return docs
      let docs = await collection.find({ somedata: 'again' }).exec()
      docs.length.should.equal(2)
      pluck(docs, 'somedata').should.not.contain('ok')

      // Test with query that doesn't match anything
      docs = await collection.find({ somedata: 'nope' }).exec()
      docs.length.should.equal(0)
    })

    it('Can find one document matching a basic query and return null if none is found', async function () {
      await collection.insert({ somedata: 'ok' })
      await collection.insert({ somedata: 'again', plus: 'additional data' })
      await collection.insert({ somedata: 'again' })

      // Test with query that will return docs
      let doc = await collection.findOne({ somedata: 'ok' })
      Object.keys(doc).length.should.equal(2)
      doc.somedata.should.equal('ok')
      assert.isDefined(doc._id)

      // Test with query that doesn't match anything
      doc = await collection.findOne({ somedata: 'nope' })
      assert.isNull(doc)
    })

    it('Can find dates and objects (non JS-native types)', async function () {
      const date1 = new Date(1234543),
        date2 = new Date(9999)

      await collection.remove({}, { multi: true })

      await collection.insert({ now: date1, sth: { name: 'nedb' } })

      let doc = await collection.findOne({ now: date1 })
      doc.sth.name.should.equal('nedb')

      doc = await collection.findOne({ now: date2 })
      assert.isNull(doc)

      doc = await collection.findOne({ sth: { name: 'nedb' } })
      doc.sth.name.should.equal('nedb')

      doc = await collection.findOne({ sth: { name: 'other' } })
      assert.isNull(doc)
    })

    it('Can use dot-notation to query subfields', async function () {
      await collection.insert({ greeting: { english: 'hello' } })

      let doc = await collection.findOne({ 'greeting.english': 'hello' })
      doc.greeting.english.should.equal('hello')

      doc = await collection.findOne({ 'greeting.english': 'hellooo' })
      assert.isNull(doc)

      doc = await collection.findOne({ 'greeting.englis': 'hello' })
      assert.isNull(doc)
    })

    it('Array fields match if any element matches', async function () {
      const doc1 = await collection.insert({
        fruits: ['pear', 'apple', 'banana'],
      })
      const doc2 = await collection.insert({
        fruits: ['coconut', 'orange', 'pear'],
      })
      const doc3 = await collection.insert({ fruits: ['banana'] })

      let docs = await collection.find({ fruits: 'pear' }).exec()
      docs.length.should.equal(2)
      pluck(docs, '_id').should.contain(doc1._id)
      pluck(docs, '_id').should.contain(doc2._id)

      docs = await collection.find({ fruits: 'banana' }).exec()
      docs.length.should.equal(2)
      pluck(docs, '_id').should.contain(doc1._id)
      pluck(docs, '_id').should.contain(doc3._id)

      docs = await collection.find({ fruits: 'doesntexist' }).exec()
      docs.length.should.equal(0)
    })

    it('Returns an error if the query is not well formed', async function () {
      await collection.insert({ hello: 'world' })
      let docs, doc
      let err = null

      try {
        docs = await collection.find({ $or: { hello: 'world' } }).exec()
      } catch (error) {
        err = error
      }
      assert.isDefined(err)
      assert.isUndefined(docs)

      try {
        doc = await collection.findOne({ $or: { hello: 'world' } })
      } catch (error) {
        err = error
      }
      assert.isDefined(err)
      assert.isUndefined(doc)
    })

    it('Changing the documents returned by find or findOne do not change the database state', async () => {
      await collection.insert({ a: 2, hello: 'world' })
      let doc = await collection.findOne({ a: 2 })
      doc.hello = 'changed'
      doc = await collection.findOne({ a: 2 })
      doc.hello.should.equal('world')
      const docs = await collection.find({ a: 2 }).exec()
      docs[0].hello = 'changed'
      doc = await collection.findOne({ a: 2 })
      doc.hello.should.equal('world')
    })

    it('Can use projections in find, normal or cursor way', async function () {
      await collection.insert({ a: 2, hello: 'world' })
      await collection.insert({ a: 24, hello: 'earth' })

      let docs = await collection.find({ a: 2 }, { a: 0, _id: 0 }).exec()
      docs.length.should.equal(1)
      assert.deepEqual(docs[0], { hello: 'world' })

      docs = await collection.find({ a: 2 }, { a: 0, _id: 0 }).exec()
      docs.length.should.equal(1)
      assert.deepEqual(docs[0], { hello: 'world' })

      // Can't use both modes at once if not _id
      let err
      try {
        await collection.find({ a: 2 }, { a: 0, hello: 1 }).exec()
      } catch (e) {
        err = e
      }
      assert.isNotNull(err)

      err = null
      try {
        await collection.find({ a: 2 }, { a: 0, hello: 1 }).exec()
      } catch (e) {
        err = e
      }
      assert.isNotNull(err)
    })

    it('Can use projections in findOne, normal or cursor way', async function () {
      await collection.insert({ a: 2, hello: 'world' })
      await collection.insert({ a: 24, hello: 'earth' })

      const doc1 = await collection.findOne({ a: 2 }, { a: 0, _id: 0 })
      assert.deepEqual(doc1, { hello: 'world' })

      const doc2 = await collection.findOne({ a: 2 }, { a: 0, _id: 0 })
      assert.deepEqual(doc2, { hello: 'world' })

      // Can't use both modes at once if not _id
      await assert.isRejected(collection.findOne({ a: 2 }, { a: 0, hello: 1 }))

      await assert.isRejected(collection.findOne({ a: 2 }, { a: 0, hello: 1 }))
    })
  })

  describe('Count', function () {
    it('Count all documents if an empty query is used', async function () {
      await collection.insert({ somedata: 'ok' })
      await collection.insert({ somedata: 'another', plus: 'additional data' })
      await collection.insert({ somedata: 'again' })

      const count = await collection.count({})

      assert.equal(count, 3)
    })

    it('Count all documents matching a basic query', async function () {
      await collection.insert({ somedata: 'ok' })
      await collection.insert({ somedata: 'again', plus: 'additional data' })
      await collection.insert({ somedata: 'again' })

      // Test with query that will return docs
      const docs = await collection.find({ somedata: 'again' }).exec()
      let count = await collection.count({ somedata: 'again' })
      count.should.equal(docs.length)

      // Test with query that doesn't match anything
      count = await collection.count({ somedata: 'nope' })
      count.should.equal(0)
    })

    it('Array fields match if any element matches', async function () {
      await collection.insert({ fruits: ['pear', 'apple', 'banana'] })
      await collection.insert({ fruits: ['coconut', 'orange', 'pear'] })
      await collection.insert({ fruits: ['banana'] })

      let docs = await collection.find({ fruits: 'pear' }).exec()
      assert.equal(docs.length, 2)

      docs = await collection.find({ fruits: 'banana' }).exec()
      assert.equal(docs.length, 2)

      docs = await collection.find({ fruits: 'doesntexist' }).exec()
      assert.equal(docs.length, 0)
    })

    it('Returns an error if the query is not well formed', async function () {
      await collection.insert({ hello: 'world' })

      await assert.isRejected(collection.count({ $or: { hello: 'world' } }))
    })
  })

  describe('Update', function () {
    it("If the query doesn't match anything, database is not modified", async function () {
      await collection.insert({ somedata: 'ok' })
      await collection.insert({ somedata: 'again', plus: 'additional data' })
      await collection.insert({ somedata: 'another' })

      // Test with query that doesn't match anything
      const n = await collection.update(
        { somedata: 'nope' },
        { newDoc: 'yes' },
        { multi: true },
      )

      n.should.equal(0)

      const docs = await collection.find({}).exec()

      const doc1 = _.find(docs, function (d) {
        return d.somedata === 'ok'
      })
      const doc2 = _.find(docs, function (d) {
        return d.somedata === 'again'
      })
      const doc3 = _.find(docs, function (d) {
        return d.somedata === 'another'
      })

      docs.length.should.equal(3)
      assert.isUndefined(
        _.find(docs, function (d) {
          return d.newDoc === 'yes'
        }),
      )

      assert.deepEqual(doc1, { _id: doc1._id, somedata: 'ok' })
      assert.deepEqual(doc2, {
        _id: doc2._id,
        somedata: 'again',
        plus: 'additional data',
      })
      assert.deepEqual(doc3, { _id: doc3._id, somedata: 'another' })
    })

    it('If timestampData option is set, update the updatedAt field', async function () {
      const beginning = Date.now()

      collection = new Collection({
        filename: testDb,
        autoload: true,
        timestampData: true,
      })

      await collection.waitFor('ready')

      const insertedDoc = await collection.insert({ hello: 'world' })

      assert.isBelow(
        insertedDoc.updatedAt.getTime() - beginning,
        reloadTimeUpperBound,
      )

      assert.isBelow(
        insertedDoc.createdAt.getTime() - beginning,
        reloadTimeUpperBound,
      )

      Object.keys(insertedDoc).length.should.equal(4)

      // Wait 100ms before performing the update
      await new Promise(resolve => setTimeout(resolve, 100))

      const step1 = Date.now()

      await collection.update(
        { _id: insertedDoc._id },
        { $set: { hello: 'mars' } },
        {},
      )

      const docs = await collection.find({ _id: insertedDoc._id }).exec()

      docs.length.should.equal(1)
      Object.keys(docs[0]).length.should.equal(4)
      docs[0]._id.should.equal(insertedDoc._id)
      docs[0].createdAt.should.deep.equal(insertedDoc.createdAt)
      docs[0].hello.should.equal('mars')
      assert.isAbove(docs[0].updatedAt.getTime() - beginning, 99) // updatedAt modified
      assert.isBelow(docs[0].updatedAt.getTime() - step1, reloadTimeUpperBound) // updatedAt modified
    })

    it('Can update multiple documents matching the query', async function () {
      let id1, id2, id3

      async function testPostUpdateState() {
        const docs = await collection.find({}).exec()

        const doc1 = _.find(docs, function (d) {
            return d._id === id1
          }),
          doc2 = _.find(docs, function (d) {
            return d._id === id2
          }),
          doc3 = _.find(docs, function (d) {
            return d._id === id3
          })

        docs.length.should.equal(3)

        Object.keys(doc1).length.should.equal(2)
        doc1.somedata.should.equal('ok')
        doc1._id.should.equal(id1)

        Object.keys(doc2).length.should.equal(2)
        doc2.newDoc.should.equal('yes')
        doc2._id.should.equal(id2)

        Object.keys(doc3).length.should.equal(2)
        doc3.newDoc.should.equal('yes')
        doc3._id.should.equal(id3)
      }

      await collection
        .insert({ somedata: 'ok' })
        .then(doc1 => {
          id1 = doc1._id
          return collection.insert({
            somedata: 'again',
            plus: 'additional data',
          })
        })
        .then(doc2 => {
          id2 = doc2._id
          return collection.insert({ somedata: 'again' })
        })
        .then(doc3 => {
          id3 = doc3._id
        })

      await collection
        .update({ somedata: 'again' }, { newDoc: 'yes' }, { multi: true })
        .then(n => {
          n.should.equal(2)
        })

      await testPostUpdateState()

      await collection.loadDatabase()

      await testPostUpdateState()
    })

    it('Can update only one document matching the query', async function () {
      // eslint-disable-next-line prefer-const
      let id1, id2, id3

      // Test DB state after update and reload
      async function testPostUpdateState() {
        const docs = await collection.find({}).exec()

        const doc1 = _.find(docs, function (d) {
            return d._id === id1
          }),
          doc2 = _.find(docs, function (d) {
            return d._id === id2
          }),
          doc3 = _.find(docs, function (d) {
            return d._id === id3
          })

        docs.length.should.equal(3)

        assert.deepEqual(doc1, { somedata: 'ok', _id: doc1._id })

        // doc2 or doc3 was modified. Since we sort on _id, and it is random
        // it can be either of two situations
        try {
          assert.deepEqual(doc2, { newDoc: 'yes', _id: doc2._id })
          assert.deepEqual(doc3, { somedata: 'again', _id: doc3._id })
        } catch (e) {
          assert.deepEqual(doc2, {
            somedata: 'again',
            plus: 'additional data',
            _id: doc2._id,
          })
          assert.deepEqual(doc3, { newDoc: 'yes', _id: doc3._id })
        }
      }

      const doc1 = await collection.insert({ somedata: 'ok' })
      id1 = doc1._id
      const doc2 = await collection.insert({
        somedata: 'again',
        plus: 'additional data',
      })
      id2 = doc2._id
      const doc3 = await collection.insert({ somedata: 'again' })
      id3 = doc3._id

      // Test with query that doesn't match anything
      const n = await collection.update(
        { somedata: 'not exists' },
        { newDoc: 'yes' },
        { multi: false },
      )

      n.should.equal(0)

      await testPostUpdateState()

      await collection.loadDatabase()

      await testPostUpdateState()
    })

    describe('Upserts', function () {
      it('Can perform upserts if needed', async function () {
        // test that update without upsert does not insert
        const nr = await collection.update(
          { impossible: 'db is empty anyway' },
          { newDoc: true },
          {},
        )

        nr.should.equal(0)
        const docs = await collection.find({}).exec()
        docs.length.should.equal(0)

        // test that upsert inserts
        const upsert = await collection.update(
          { impossible: 'db is empty anyway' },
          { something: 'created ok' },
          { upsert: true },
        )

        upsert.acknowledged.should.equal(true)

        const newDoc = await collection.findOne({ something: 'created ok' })

        newDoc.something.should.equal('created ok')

        assert.isDefined(newDoc._id)
        const docs2 = await collection.find({}).exec()
        docs2.length.should.equal(1)
        docs2[0].something.should.equal('created ok')

        // Modifying the returned upserted document doesn't modify the database
        newDoc.newField = true
        const docs3 = await collection.find({}).exec()
        assert.isUndefined(docs3[0].newField)
      })

      it('If the update query is a normal object with no modifiers, it is the doc that will be upserted', function (done) {
        collection.update(
          { $or: [{ a: 4 }, { a: 5 }] },
          { hello: 'world', bloup: 'blap' },
          { upsert: true },
          function () {
            collection.find({}, function (err, docs) {
              assert.isNull(err)
              docs.length.should.equal(1)
              const doc = docs[0]
              Object.keys(doc).length.should.equal(3)
              doc.hello.should.equal('world')
              doc.bloup.should.equal('blap')
              done()
            })
          },
        )
      })

      it('If the update query contains modifiers, it is applied to the object resulting from removing all operators from the find query 1', function (done) {
        collection.update(
          { $or: [{ a: 4 }, { a: 5 }] },
          { $set: { hello: 'world' }, $inc: { bloup: 3 } },
          { upsert: true },
          function () {
            collection.find({ hello: 'world' }, function (err, docs) {
              assert.isNull(err)
              docs.length.should.equal(1)
              const doc = docs[0]
              Object.keys(doc).length.should.equal(3)
              doc.hello.should.equal('world')
              doc.bloup.should.equal(3)
              done()
            })
          },
        )
      })

      it('If the update query contains modifiers, it is applied to the object resulting from removing all operators from the find query 2', function (done) {
        collection.update(
          { $or: [{ a: 4 }, { a: 5 }], cac: 'rrr' },
          { $set: { hello: 'world' }, $inc: { bloup: 3 } },
          { upsert: true },
          function () {
            collection.find({ hello: 'world' }, function (err, docs) {
              assert.isNull(err)
              docs.length.should.equal(1)
              const doc = docs[0]
              Object.keys(doc).length.should.equal(4)
              doc.cac.should.equal('rrr')
              doc.hello.should.equal('world')
              doc.bloup.should.equal(3)
              done()
            })
          },
        )
      })

      it('Performing upsert with badly formatted fields yields a standard error not an exception', function (done) {
        collection.update(
          { _id: '1234' },
          { $set: { $$badfield: 5 } },
          { upsert: true },
          function (err) {
            assert.isDefined(err)
            done()
          },
        )
      })
    }) // ==== End of 'Upserts' ==== //

    it('Cannot perform update if the update query is not either registered-modifiers-only or copy-only, or contain badly formatted fields', function (done) {
      collection.insert({ something: 'yup' }, function () {
        collection.update(
          {},
          { boom: { $badfield: 5 } },
          { multi: false },
          function (err) {
            assert.isDefined(err)

            collection.update(
              {},
              { boom: { 'bad.field': 5 } },
              { multi: false },
              function (err) {
                assert.isDefined(err)

                collection.update(
                  {},
                  { $inc: { test: 5 }, mixed: 'rrr' },
                  { multi: false },
                  function (err) {
                    assert.isDefined(err)

                    collection.update(
                      {},
                      { $inexistent: { test: 5 } },
                      { multi: false },
                      function (err) {
                        assert.isDefined(err)

                        done()
                      },
                    )
                  },
                )
              },
            )
          },
        )
      })
    })

    it('Can update documents using multiple modifiers', function (done) {
      let id

      collection.insert(
        { something: 'yup', other: 40 },
        function (err, newDoc) {
          id = newDoc._id

          collection.update(
            {},
            { $set: { something: 'changed' }, $inc: { other: 10 } },
            { multi: false },
            function (err, nr) {
              assert.isNull(err)
              nr.should.equal(1)

              collection.findOne({ _id: id }, function (err, doc) {
                Object.keys(doc).length.should.equal(3)
                doc._id.should.equal(id)
                doc.something.should.equal('changed')
                doc.other.should.equal(50)

                done()
              })
            },
          )
        },
      )
    })

    it('Can upsert a document even with modifiers', function (done) {
      collection.update(
        { bloup: 'blap' },
        { $set: { hello: 'world' } },
        { upsert: true },
        function (err, nr, newDoc) {
          assert.isNull(err)
          nr.should.equal(1)
          newDoc.bloup.should.equal('blap')
          newDoc.hello.should.equal('world')
          assert.isDefined(newDoc._id)

          collection.find({}, function (err, docs) {
            docs.length.should.equal(1)
            Object.keys(docs[0]).length.should.equal(3)
            docs[0].hello.should.equal('world')
            docs[0].bloup.should.equal('blap')
            assert.isDefined(docs[0]._id)

            done()
          })
        },
      )
    })

    it('When using modifiers, the only way to update subdocs is with the dot-notation', function (done) {
      collection.insert({ bloup: { blip: 'blap', other: true } }, function () {
        // Correct methos
        collection.update(
          {},
          { $set: { 'bloup.blip': 'hello' } },
          {},
          function () {
            collection.findOne({}, function (err, doc) {
              doc.bloup.blip.should.equal('hello')
              doc.bloup.other.should.equal(true)

              // Wrong
              collection.update(
                {},
                { $set: { bloup: { blip: 'ola' } } },
                {},
                function () {
                  collection.findOne({}, function (err, doc) {
                    doc.bloup.blip.should.equal('ola')
                    assert.isUndefined(doc.bloup.other) // This information was lost

                    done()
                  })
                },
              )
            })
          },
        )
      })
    })

    it('Returns an error if the query is not well formed', function (done) {
      collection.insert({ hello: 'world' }, function () {
        collection.update(
          { $or: { hello: 'world' } },
          { a: 1 },
          {},
          function (err, nr, upsert) {
            assert.isDefined(err)
            assert.isUndefined(nr)
            assert.isUndefined(upsert)

            done()
          },
        )
      })
    })

    it('If an error is thrown by a modifier, the database state is not changed', function (done) {
      collection.insert({ hello: 'world' }, function (err, newDoc) {
        collection.update({}, { $inc: { hello: 4 } }, {}, function (err, nr) {
          assert.isDefined(err)
          assert.isUndefined(nr)

          collection.find({}, function (err, docs) {
            assert.deepEqual(docs, [{ _id: newDoc._id, hello: 'world' }])

            done()
          })
        })
      })
    })

    it('Cant change the _id of a document', function (done) {
      collection.insert({ a: 2 }, function (err, newDoc) {
        collection.update({ a: 2 }, { a: 2, _id: 'nope' }, {}, function (err) {
          assert.isDefined(err)

          collection.find({}, function (err, docs) {
            docs.length.should.equal(1)
            Object.keys(docs[0]).length.should.equal(2)
            docs[0].a.should.equal(2)
            docs[0]._id.should.equal(newDoc._id)

            collection.update(
              { a: 2 },
              { $set: { _id: 'nope' } },
              {},
              function (err) {
                assert.isDefined(err)

                collection.find({}, function (err, docs) {
                  docs.length.should.equal(1)
                  Object.keys(docs[0]).length.should.equal(2)
                  docs[0].a.should.equal(2)
                  docs[0]._id.should.equal(newDoc._id)

                  done()
                })
              },
            )
          })
        })
      })
    })

    it('Non-multi updates are persistent', function (done) {
      collection.insert({ a: 1, hello: 'world' }, function (err, doc1) {
        collection.insert({ a: 2, hello: 'earth' }, function (err, doc2) {
          collection.update(
            { a: 2 },
            { $set: { hello: 'changed' } },
            {},
            function (err) {
              assert.isNull(err)

              collection.find({}, function (err, docs) {
                docs.sort(function (a, b) {
                  return a.a - b.a
                })
                docs.length.should.equal(2)
                _.isEqual(docs[0], {
                  _id: doc1._id,
                  a: 1,
                  hello: 'world',
                }).should.equal(true)
                _.isEqual(docs[1], {
                  _id: doc2._id,
                  a: 2,
                  hello: 'changed',
                }).should.equal(true)

                // Even after a reload the database state hasn't changed
                collection.loadDatabase(function (err) {
                  assert.isNull(err)

                  collection.find({}, function (err, docs) {
                    docs.sort(function (a, b) {
                      return a.a - b.a
                    })
                    docs.length.should.equal(2)
                    _.isEqual(docs[0], {
                      _id: doc1._id,
                      a: 1,
                      hello: 'world',
                    }).should.equal(true)
                    _.isEqual(docs[1], {
                      _id: doc2._id,
                      a: 2,
                      hello: 'changed',
                    }).should.equal(true)

                    done()
                  })
                })
              })
            },
          )
        })
      })
    })

    it('Multi updates are persistent', function (done) {
      collection.insert({ a: 1, hello: 'world' }, function (err, doc1) {
        collection.insert({ a: 2, hello: 'earth' }, function (err, doc2) {
          collection.insert({ a: 5, hello: 'pluton' }, function (err, doc3) {
            collection.update(
              { a: { $in: [1, 2] } },
              { $set: { hello: 'changed' } },
              { multi: true },
              function (err) {
                assert.isNull(err)

                collection.find({}, function (err, docs) {
                  docs.sort(function (a, b) {
                    return a.a - b.a
                  })
                  docs.length.should.equal(3)
                  _.isEqual(docs[0], {
                    _id: doc1._id,
                    a: 1,
                    hello: 'changed',
                  }).should.equal(true)
                  _.isEqual(docs[1], {
                    _id: doc2._id,
                    a: 2,
                    hello: 'changed',
                  }).should.equal(true)
                  _.isEqual(docs[2], {
                    _id: doc3._id,
                    a: 5,
                    hello: 'pluton',
                  }).should.equal(true)

                  // Even after a reload the database state hasn't changed
                  collection.loadDatabase(function (err) {
                    assert.isNull(err)

                    collection.find({}, function (err, docs) {
                      docs.sort(function (a, b) {
                        return a.a - b.a
                      })
                      docs.length.should.equal(3)
                      _.isEqual(docs[0], {
                        _id: doc1._id,
                        a: 1,
                        hello: 'changed',
                      }).should.equal(true)
                      _.isEqual(docs[1], {
                        _id: doc2._id,
                        a: 2,
                        hello: 'changed',
                      }).should.equal(true)
                      _.isEqual(docs[2], {
                        _id: doc3._id,
                        a: 5,
                        hello: 'pluton',
                      }).should.equal(true)

                      done()
                    })
                  })
                })
              },
            )
          })
        })
      })
    })

    it('Can update without the options arg (will use defaults then)', function (done) {
      collection.insert({ a: 1, hello: 'world' }, function (err, doc1) {
        collection.insert({ a: 2, hello: 'earth' }, function (err, doc2) {
          collection.insert({ a: 5, hello: 'pluton' }, function (err, doc3) {
            collection.update(
              { a: 2 },
              { $inc: { a: 10 } },
              function (err, nr) {
                assert.isNull(err)
                nr.should.equal(1)
                collection.find({}, function (err, docs) {
                  const d1 = _.find(docs, function (doc) {
                      return doc._id === doc1._id
                    }),
                    d2 = _.find(docs, function (doc) {
                      return doc._id === doc2._id
                    }),
                    d3 = _.find(docs, function (doc) {
                      return doc._id === doc3._id
                    })
                  d1.a.should.equal(1)
                  d2.a.should.equal(12)
                  d3.a.should.equal(5)

                  done()
                })
              },
            )
          })
        })
      })
    })

    it('If a multi update fails on one document, previous updates should be rolled back', function (done) {
      collection.ensureIndex({ fieldName: 'a' })
      collection.insert({ a: 4 }, function (err, doc1) {
        collection.insert({ a: 5 }, function (err, doc2) {
          collection.insert({ a: 'abc' }, function (err, doc3) {
            // With this query, candidates are always returned in the order 4, 5, 'abc' so it's always the last one which fails
            collection.update(
              { a: { $in: [4, 5, 'abc'] } },
              { $inc: { a: 10 } },
              { multi: true },
              function (err) {
                assert.isDefined(err)

                // No index modified
                _.each(collection.indexes, function (index) {
                  const docs = index.getAll(),
                    d1 = _.find(docs, function (doc) {
                      return doc._id === doc1._id
                    }),
                    d2 = _.find(docs, function (doc) {
                      return doc._id === doc2._id
                    }),
                    d3 = _.find(docs, function (doc) {
                      return doc._id === doc3._id
                    })
                  // All changes rolled back, including those that didn't trigger an error
                  d1.a.should.equal(4)
                  d2.a.should.equal(5)
                  d3.a.should.equal('abc')
                })

                done()
              },
            )
          })
        })
      })
    })

    it('If an index constraint is violated by an update, all changes should be rolled back', function (done) {
      collection.ensureIndex({ fieldName: 'a', unique: true })
      collection.insert({ a: 4 }, function (err, doc1) {
        collection.insert({ a: 5 }, function (err, doc2) {
          // With this query, candidates are always returned in the order 4, 5, 'abc' so it's always the last one which fails
          collection.update(
            { a: { $in: [4, 5, 'abc'] } },
            { $set: { a: 10 } },
            { multi: true },
            function (err) {
              assert.isDefined(err)

              // Check that no index was modified
              _.each(collection.indexes, function (index) {
                const docs = index.getAll(),
                  d1 = _.find(docs, function (doc) {
                    return doc._id === doc1._id
                  }),
                  d2 = _.find(docs, function (doc) {
                    return doc._id === doc2._id
                  })
                d1.a.should.equal(4)
                d2.a.should.equal(5)
              })

              done()
            },
          )
        })
      })
    })

    it('If options.returnUpdatedDocs is true, return all matched docs', function (done) {
      collection.insert([{ a: 4 }, { a: 5 }, { a: 6 }], function (err, docs) {
        docs.length.should.equal(3)

        collection.update(
          { a: 7 },
          { $set: { u: 1 } },
          { multi: true, returnUpdatedDocs: true },
          function (err, num, updatedDocs) {
            num.should.equal(0)
            updatedDocs.length.should.equal(0)

            collection.update(
              { a: 5 },
              { $set: { u: 2 } },
              { multi: true, returnUpdatedDocs: true },
              function (err, num, updatedDocs) {
                num.should.equal(1)
                updatedDocs.length.should.equal(1)
                updatedDocs[0].a.should.equal(5)
                updatedDocs[0].u.should.equal(2)

                collection.update(
                  { a: { $in: [4, 6] } },
                  { $set: { u: 3 } },
                  { multi: true, returnUpdatedDocs: true },
                  function (err, num, updatedDocs) {
                    num.should.equal(2)
                    updatedDocs.length.should.equal(2)
                    updatedDocs[0].u.should.equal(3)
                    updatedDocs[1].u.should.equal(3)
                    if (updatedDocs[0].a === 4) {
                      updatedDocs[0].a.should.equal(4)
                      updatedDocs[1].a.should.equal(6)
                    } else {
                      updatedDocs[0].a.should.equal(6)
                      updatedDocs[1].a.should.equal(4)
                    }

                    done()
                  },
                )
              },
            )
          },
        )
      })
    })

    it('createdAt property is unchanged and updatedAt correct after an update, even a complete document replacement', function (done) {
      const d2 = new Collection({ inMemoryOnly: true, timestampData: true })
      d2.insert({ a: 1 })
      d2.findOne({ a: 1 }, function (err, doc) {
        const createdAt = doc.createdAt.getTime()

        // Modifying update
        setTimeout(function () {
          d2.update({ a: 1 }, { $set: { b: 2 } }, {})
          d2.findOne({ a: 1 }, function (err, doc) {
            doc.createdAt.getTime().should.equal(createdAt)
            assert.isBelow(Date.now() - doc.updatedAt.getTime(), 5)

            // Complete replacement
            setTimeout(function () {
              d2.update({ a: 1 }, { c: 3 }, {})
              d2.findOne({ c: 3 }, function (err, doc) {
                doc.createdAt.getTime().should.equal(createdAt)
                assert.isBelow(Date.now() - doc.updatedAt.getTime(), 5)

                done()
              })
            }, 20)
          })
        }, 20)
      })
    })

    describe('Callback signature', function () {
      it('Regular update, multi false', function (done) {
        collection.insert({ a: 1 })
        collection.insert({ a: 2 })

        // returnUpdatedDocs set to false
        collection.update(
          { a: 1 },
          { $set: { b: 20 } },
          {},
          function (err, numAffected, affectedDocuments, upsert) {
            assert.isNull(err)
            numAffected.should.equal(1)
            assert.isUndefined(affectedDocuments)
            assert.isUndefined(upsert)

            // returnUpdatedDocs set to true
            collection.update(
              { a: 1 },
              { $set: { b: 21 } },
              { returnUpdatedDocs: true },
              function (err, numAffected, affectedDocuments, upsert) {
                assert.isNull(err)
                numAffected.should.equal(1)
                affectedDocuments.a.should.equal(1)
                affectedDocuments.b.should.equal(21)
                assert.isUndefined(upsert)

                done()
              },
            )
          },
        )
      })

      it('Regular update, multi true', function (done) {
        collection.insert({ a: 1 })
        collection.insert({ a: 2 })

        // returnUpdatedDocs set to false
        collection.update(
          {},
          { $set: { b: 20 } },
          { multi: true },
          function (err, numAffected, affectedDocuments, upsert) {
            assert.isNull(err)
            numAffected.should.equal(2)
            assert.isUndefined(affectedDocuments)
            assert.isUndefined(upsert)

            // returnUpdatedDocs set to true
            collection.update(
              {},
              { $set: { b: 21 } },
              { multi: true, returnUpdatedDocs: true },
              function (err, numAffected, affectedDocuments, upsert) {
                assert.isNull(err)
                numAffected.should.equal(2)
                affectedDocuments.length.should.equal(2)
                assert.isUndefined(upsert)

                done()
              },
            )
          },
        )
      })

      it('Upsert', function (done) {
        collection.insert({ a: 1 })
        collection.insert({ a: 2 })

        // Upsert flag not set
        collection.update(
          { a: 3 },
          { $set: { b: 20 } },
          {},
          function (err, numAffected, affectedDocuments, upsert) {
            assert.isNull(err)
            numAffected.should.equal(0)
            assert.isUndefined(affectedDocuments)
            assert.isUndefined(upsert)

            // Upsert flag set
            collection.update(
              { a: 3 },
              { $set: { b: 21 } },
              { upsert: true },
              function (err, numAffected, affectedDocuments, upsert) {
                assert.isNull(err)
                numAffected.should.equal(1)
                affectedDocuments.a.should.equal(3)
                affectedDocuments.b.should.equal(21)
                upsert.should.equal(true)

                collection.find({}, function (err, docs) {
                  docs.length.should.equal(3)
                  done()
                })
              },
            )
          },
        )
      })
    }) // ==== End of 'Update - Callback signature' ==== //
  }) // ==== End of 'Update' ==== //

  describe('Remove', function () {
    it('Can remove multiple documents', function (done) {
      let id1, id2, id3

      // Test DB status
      function testPostUpdateState(cb) {
        collection.find({}, function (err, docs) {
          docs.length.should.equal(1)

          Object.keys(docs[0]).length.should.equal(2)
          docs[0]._id.should.equal(id1)
          docs[0].somedata.should.equal('ok')

          return cb()
        })
      }

      // Actually launch the test
      async.waterfall(
        [
          function (cb) {
            collection.insert({ somedata: 'ok' }, function (err, doc1) {
              id1 = doc1._id
              collection.insert(
                { somedata: 'again', plus: 'additional data' },
                function (err, doc2) {
                  id2 = doc2._id
                  collection.insert(
                    { somedata: 'again' },
                    function (err, doc3) {
                      id3 = doc3._id
                      return cb(err)
                    },
                  )
                },
              )
            })
          },
          function (cb) {
            // Test with query that doesn't match anything
            collection.remove(
              { somedata: 'again' },
              { multi: true },
              function (err, n) {
                assert.isNull(err)
                n.should.equal(2)
                return cb()
              },
            )
          },
          async.apply(testPostUpdateState),
          function (cb) {
            collection.loadDatabase(function (err) {
              return cb(err)
            })
          },
          async.apply(testPostUpdateState),
        ],
        done,
      )
    })

    // This tests concurrency issues
    it('Remove can be called multiple times in parallel and everything that needs to be removed will be', function (done) {
      collection.insert({ planet: 'Earth' }, function () {
        collection.insert({ planet: 'Mars' }, function () {
          collection.insert({ planet: 'Saturn' }, function () {
            collection.find({}, function (err, docs) {
              docs.length.should.equal(3)

              // Remove two docs simultaneously
              const toRemove = ['Mars', 'Saturn']
              async.each(
                toRemove,
                function (planet, cb) {
                  collection.remove({ planet: planet }, function (err) {
                    return cb(err)
                  })
                },
                function () {
                  collection.find({}, function (err, docs) {
                    docs.length.should.equal(1)

                    done()
                  })
                },
              )
            })
          })
        })
      })
    })

    it('Returns an error if the query is not well formed', function (done) {
      collection.insert({ hello: 'world' }, function () {
        collection.remove(
          { $or: { hello: 'world' } },
          {},
          function (err, nr, upsert) {
            assert.isDefined(err)
            assert.isUndefined(nr)
            assert.isUndefined(upsert)

            done()
          },
        )
      })
    })

    it('Non-multi removes are persistent', function (done) {
      collection.insert({ a: 1, hello: 'world' }, function (err, doc1) {
        collection.insert({ a: 2, hello: 'earth' }, function () {
          collection.insert({ a: 3, hello: 'moto' }, function (err, doc3) {
            collection.remove({ a: 2 }, {}, function (err) {
              assert.isNull(err)

              collection.find({}, function (err, docs) {
                docs.sort(function (a, b) {
                  return a.a - b.a
                })
                docs.length.should.equal(2)
                _.isEqual(docs[0], {
                  _id: doc1._id,
                  a: 1,
                  hello: 'world',
                }).should.equal(true)
                _.isEqual(docs[1], {
                  _id: doc3._id,
                  a: 3,
                  hello: 'moto',
                }).should.equal(true)

                // Even after a reload the database state hasn't changed
                collection.loadDatabase(function (err) {
                  assert.isNull(err)

                  collection.find({}, function (err, docs) {
                    docs.sort(function (a, b) {
                      return a.a - b.a
                    })
                    docs.length.should.equal(2)
                    _.isEqual(docs[0], {
                      _id: doc1._id,
                      a: 1,
                      hello: 'world',
                    }).should.equal(true)
                    _.isEqual(docs[1], {
                      _id: doc3._id,
                      a: 3,
                      hello: 'moto',
                    }).should.equal(true)

                    done()
                  })
                })
              })
            })
          })
        })
      })
    })

    it('Multi removes are persistent', function (done) {
      collection.insert({ a: 1, hello: 'world' }, function () {
        collection.insert({ a: 2, hello: 'earth' }, function (err, doc2) {
          collection.insert({ a: 3, hello: 'moto' }, function () {
            collection.remove(
              { a: { $in: [1, 3] } },
              { multi: true },
              function (err) {
                assert.isNull(err)

                collection.find({}, function (err, docs) {
                  docs.length.should.equal(1)
                  _.isEqual(docs[0], {
                    _id: doc2._id,
                    a: 2,
                    hello: 'earth',
                  }).should.equal(true)

                  // Even after a reload the database state hasn't changed
                  collection.loadDatabase(function (err) {
                    assert.isNull(err)

                    collection.find({}, function (err, docs) {
                      docs.length.should.equal(1)
                      _.isEqual(docs[0], {
                        _id: doc2._id,
                        a: 2,
                        hello: 'earth',
                      }).should.equal(true)

                      done()
                    })
                  })
                })
              },
            )
          })
        })
      })
    })

    it('Can remove without the options arg (will use defaults then)', function (done) {
      collection.insert({ a: 1, hello: 'world' }, function (err, doc1) {
        collection.insert({ a: 2, hello: 'earth' }, function (err, doc2) {
          collection.insert({ a: 5, hello: 'pluton' }, function (err, doc3) {
            collection.remove({ a: 2 }, function (err, nr) {
              assert.isNull(err)
              nr.should.equal(1)
              collection.find({}, function (err, docs) {
                const d1 = _.find(docs, function (doc) {
                    return doc._id === doc1._id
                  }),
                  d2 = _.find(docs, function (doc) {
                    return doc._id === doc2._id
                  }),
                  d3 = _.find(docs, function (doc) {
                    return doc._id === doc3._id
                  })
                d1.a.should.equal(1)
                assert.isUndefined(d2)
                d3.a.should.equal(5)

                done()
              })
            })
          })
        })
      })
    })
  }) // ==== End of 'Remove' ==== //

  describe('Using indexes', function () {
    describe('ensureIndex and index initialization in database loading', function () {
      it('ensureIndex can be called right after a loadDatabase and be initialized and filled correctly', function (done) {
        const now = new Date(),
          rawData =
            serialize({ _id: 'aaa', z: '1', a: 2, ages: [1, 5, 12] }) +
            '\n' +
            serialize({ _id: 'bbb', z: '2', hello: 'world' }) +
            '\n' +
            serialize({ _id: 'ccc', z: '3', nested: { today: now } })
        collection.getAllData().length.should.equal(0)

        fs.writeFile(testDb, rawData, 'utf8', function () {
          collection.loadDatabase(function () {
            collection.getAllData().length.should.equal(3)

            assert.deepEqual(Object.keys(collection.indexes), ['_id'])

            collection.ensureIndex({ fieldName: 'z' })
            collection.indexes.z.fieldName.should.equal('z')
            collection.indexes.z.unique.should.equal(false)
            collection.indexes.z.sparse.should.equal(false)
            collection.indexes.z.tree.getNumberOfKeys().should.equal(3)
            collection.indexes.z.tree
              .search('1')[0]
              .should.equal(collection.getAllData()[0])
            collection.indexes.z.tree
              .search('2')[0]
              .should.equal(collection.getAllData()[1])
            collection.indexes.z.tree
              .search('3')[0]
              .should.equal(collection.getAllData()[2])

            done()
          })
        })
      })

      it('ensureIndex can be called twice on the same field, the second call will ahve no effect', function (done) {
        Object.keys(collection.indexes).length.should.equal(1)
        Object.keys(collection.indexes)[0].should.equal('_id')

        collection.insert({ planet: 'Earth' }, function () {
          collection.insert({ planet: 'Mars' }, function () {
            collection.find({}, function (err, docs) {
              docs.length.should.equal(2)

              collection.ensureIndex({ fieldName: 'planet' }, function (err) {
                assert.isNull(err)
                Object.keys(collection.indexes).length.should.equal(2)
                Object.keys(collection.indexes)[0].should.equal('_id')
                Object.keys(collection.indexes)[1].should.equal('planet')

                collection.indexes.planet.getAll().length.should.equal(2)

                // This second call has no effect, documents don't get inserted twice in the index
                collection.ensureIndex({ fieldName: 'planet' }, function (err) {
                  assert.isNull(err)
                  Object.keys(collection.indexes).length.should.equal(2)
                  Object.keys(collection.indexes)[0].should.equal('_id')
                  Object.keys(collection.indexes)[1].should.equal('planet')

                  collection.indexes.planet.getAll().length.should.equal(2)

                  done()
                })
              })
            })
          })
        })
      })

      it('ensureIndex can be called after the data set was modified and the index still be correct', function (done) {
        const rawData =
          serialize({ _id: 'aaa', z: '1', a: 2, ages: [1, 5, 12] }) +
          '\n' +
          serialize({ _id: 'bbb', z: '2', hello: 'world' })
        collection.getAllData().length.should.equal(0)

        fs.writeFile(testDb, rawData, 'utf8', function () {
          collection.loadDatabase(function () {
            collection.getAllData().length.should.equal(2)

            assert.deepEqual(Object.keys(collection.indexes), ['_id'])

            collection.insert({ z: '12', yes: 'yes' }, function (err, newDoc1) {
              collection.insert(
                { z: '14', nope: 'nope' },
                function (err, newDoc2) {
                  collection.remove({ z: '2' }, {}, function () {
                    collection.update(
                      { z: '1' },
                      { $set: { yes: 'yep' } },
                      {},
                      function () {
                        assert.deepEqual(Object.keys(collection.indexes), [
                          '_id',
                        ])

                        collection.ensureIndex({ fieldName: 'z' })
                        collection.indexes.z.fieldName.should.equal('z')
                        collection.indexes.z.unique.should.equal(false)
                        collection.indexes.z.sparse.should.equal(false)
                        collection.indexes.z.tree
                          .getNumberOfKeys()
                          .should.equal(3)

                        // The pointers in the _id and z indexes are the same
                        collection.indexes.z.tree
                          .search('1')[0]
                          .should.equal(
                            collection.indexes._id.getMatching('aaa')[0],
                          )
                        collection.indexes.z.tree
                          .search('12')[0]
                          .should.equal(
                            collection.indexes._id.getMatching(newDoc1._id)[0],
                          )
                        collection.indexes.z.tree
                          .search('14')[0]
                          .should.equal(
                            collection.indexes._id.getMatching(newDoc2._id)[0],
                          )

                        // The data in the z index is correct
                        collection.find({}, function (err, docs) {
                          const doc0 = _.find(docs, function (doc) {
                              return doc._id === 'aaa'
                            }),
                            doc1 = _.find(docs, function (doc) {
                              return doc._id === newDoc1._id
                            }),
                            doc2 = _.find(docs, function (doc) {
                              return doc._id === newDoc2._id
                            })
                          docs.length.should.equal(3)

                          assert.deepEqual(doc0, {
                            _id: 'aaa',
                            z: '1',
                            a: 2,
                            ages: [1, 5, 12],
                            yes: 'yep',
                          })
                          assert.deepEqual(doc1, {
                            _id: newDoc1._id,
                            z: '12',
                            yes: 'yes',
                          })
                          assert.deepEqual(doc2, {
                            _id: newDoc2._id,
                            z: '14',
                            nope: 'nope',
                          })

                          done()
                        })
                      },
                    )
                  })
                },
              )
            })
          })
        })
      })

      it('ensureIndex can be called before a loadDatabase and still be initialized and filled correctly', function (done) {
        const now = new Date(),
          rawData =
            serialize({ _id: 'aaa', z: '1', a: 2, ages: [1, 5, 12] }) +
            '\n' +
            serialize({ _id: 'bbb', z: '2', hello: 'world' }) +
            '\n' +
            serialize({ _id: 'ccc', z: '3', nested: { today: now } })
        collection.getAllData().length.should.equal(0)

        collection.ensureIndex({ fieldName: 'z' })
        collection.indexes.z.fieldName.should.equal('z')
        collection.indexes.z.unique.should.equal(false)
        collection.indexes.z.sparse.should.equal(false)
        collection.indexes.z.tree.getNumberOfKeys().should.equal(0)

        fs.writeFile(testDb, rawData, 'utf8', function () {
          collection.loadDatabase(function () {
            const doc1 = _.find(collection.getAllData(), function (doc) {
                return doc.z === '1'
              }),
              doc2 = _.find(collection.getAllData(), function (doc) {
                return doc.z === '2'
              }),
              doc3 = _.find(collection.getAllData(), function (doc) {
                return doc.z === '3'
              })
            collection.getAllData().length.should.equal(3)

            collection.indexes.z.tree.getNumberOfKeys().should.equal(3)
            collection.indexes.z.tree.search('1')[0].should.equal(doc1)
            collection.indexes.z.tree.search('2')[0].should.equal(doc2)
            collection.indexes.z.tree.search('3')[0].should.equal(doc3)

            done()
          })
        })
      })

      it('Can initialize multiple indexes on a database load', function (done) {
        const now = new Date(),
          rawData =
            serialize({ _id: 'aaa', z: '1', a: 2, ages: [1, 5, 12] }) +
            '\n' +
            serialize({ _id: 'bbb', z: '2', a: 'world' }) +
            '\n' +
            serialize({ _id: 'ccc', z: '3', a: { today: now } })
        collection.getAllData().length.should.equal(0)
        collection.ensureIndex({ fieldName: 'z' }, function () {
          collection.ensureIndex({ fieldName: 'a' }, function () {
            collection.indexes.a.tree.getNumberOfKeys().should.equal(0)
            collection.indexes.z.tree.getNumberOfKeys().should.equal(0)

            fs.writeFile(testDb, rawData, 'utf8', function () {
              collection.loadDatabase(function (err) {
                const doc1 = _.find(collection.getAllData(), function (doc) {
                    return doc.z === '1'
                  }),
                  doc2 = _.find(collection.getAllData(), function (doc) {
                    return doc.z === '2'
                  }),
                  doc3 = _.find(collection.getAllData(), function (doc) {
                    return doc.z === '3'
                  })
                assert.isNull(err)
                collection.getAllData().length.should.equal(3)

                collection.indexes.z.tree.getNumberOfKeys().should.equal(3)
                collection.indexes.z.tree.search('1')[0].should.equal(doc1)
                collection.indexes.z.tree.search('2')[0].should.equal(doc2)
                collection.indexes.z.tree.search('3')[0].should.equal(doc3)

                collection.indexes.a.tree.getNumberOfKeys().should.equal(3)
                collection.indexes.a.tree.search(2)[0].should.equal(doc1)
                collection.indexes.a.tree.search('world')[0].should.equal(doc2)
                collection.indexes.a.tree
                  .search({ today: now })[0]
                  .should.equal(doc3)

                done()
              })
            })
          })
        })
      })

      it('If a unique constraint is not respected, database loading will not work and no data will be inserted', function (done) {
        const now = new Date(),
          rawData =
            serialize({ _id: 'aaa', z: '1', a: 2, ages: [1, 5, 12] }) +
            '\n' +
            serialize({ _id: 'bbb', z: '2', a: 'world' }) +
            '\n' +
            serialize({ _id: 'ccc', z: '1', a: { today: now } })
        collection.getAllData().length.should.equal(0)

        collection.ensureIndex({ fieldName: 'z', unique: true })
        collection.indexes.z.tree.getNumberOfKeys().should.equal(0)

        fs.writeFile(testDb, rawData, 'utf8', function () {
          collection.loadDatabase(function (err) {
            err.errorType.should.equal('uniqueViolated')
            err.key.should.equal('1')
            collection.getAllData().length.should.equal(0)
            collection.indexes.z.tree.getNumberOfKeys().should.equal(0)

            done()
          })
        })
      })

      it('If a unique constraint is not respected, ensureIndex will return an error and not create an index', function (done) {
        collection.insert({ a: 1, b: 4 }, function () {
          collection.insert({ a: 2, b: 45 }, function () {
            collection.insert({ a: 1, b: 3 }, function () {
              collection.ensureIndex({ fieldName: 'b' }, function (err) {
                assert.isNull(err)

                collection.ensureIndex(
                  { fieldName: 'a', unique: true },
                  function (err) {
                    err.errorType.should.equal('uniqueViolated')
                    assert.deepEqual(Object.keys(collection.indexes), [
                      '_id',
                      'b',
                    ])

                    done()
                  },
                )
              })
            })
          })
        })
      })

      it('Can remove an index', function (done) {
        collection.ensureIndex({ fieldName: 'e' }, function (err) {
          assert.isNull(err)

          Object.keys(collection.indexes).length.should.equal(2)
          assert.isNotNull(collection.indexes.e)

          collection.removeIndex('e', function (err) {
            assert.isNull(err)
            Object.keys(collection.indexes).length.should.equal(1)
            assert.isUndefined(collection.indexes.e)

            done()
          })
        })
      })
    }) // ==== End of 'ensureIndex and index initialization in database loading' ==== //

    describe('Indexing newly inserted documents', function () {
      it('Newly inserted documents are indexed', function (done) {
        collection.ensureIndex({ fieldName: 'z' })
        collection.indexes.z.tree.getNumberOfKeys().should.equal(0)

        collection.insert({ a: 2, z: 'yes' }, function (err, newDoc) {
          collection.indexes.z.tree.getNumberOfKeys().should.equal(1)
          assert.deepEqual(collection.indexes.z.getMatching('yes'), [newDoc])

          collection.insert({ a: 5, z: 'nope' }, function (err, newDoc) {
            collection.indexes.z.tree.getNumberOfKeys().should.equal(2)
            assert.deepEqual(collection.indexes.z.getMatching('nope'), [newDoc])

            done()
          })
        })
      })

      it('If multiple indexes are defined, the document is inserted in all of them', function (done) {
        collection.ensureIndex({ fieldName: 'z' })
        collection.ensureIndex({ fieldName: 'ya' })
        collection.indexes.z.tree.getNumberOfKeys().should.equal(0)

        collection.insert(
          { a: 2, z: 'yes', ya: 'indeed' },
          function (err, newDoc) {
            collection.indexes.z.tree.getNumberOfKeys().should.equal(1)
            collection.indexes.ya.tree.getNumberOfKeys().should.equal(1)
            assert.deepEqual(collection.indexes.z.getMatching('yes'), [newDoc])
            assert.deepEqual(collection.indexes.ya.getMatching('indeed'), [
              newDoc,
            ])

            collection.insert(
              { a: 5, z: 'nope', ya: 'sure' },
              function (err, newDoc2) {
                collection.indexes.z.tree.getNumberOfKeys().should.equal(2)
                collection.indexes.ya.tree.getNumberOfKeys().should.equal(2)
                assert.deepEqual(collection.indexes.z.getMatching('nope'), [
                  newDoc2,
                ])
                assert.deepEqual(collection.indexes.ya.getMatching('sure'), [
                  newDoc2,
                ])

                done()
              },
            )
          },
        )
      })

      it('Can insert two docs at the same key for a non unique index', function (done) {
        collection.ensureIndex({ fieldName: 'z' })
        collection.indexes.z.tree.getNumberOfKeys().should.equal(0)

        collection.insert({ a: 2, z: 'yes' }, function (err, newDoc) {
          collection.indexes.z.tree.getNumberOfKeys().should.equal(1)
          assert.deepEqual(collection.indexes.z.getMatching('yes'), [newDoc])

          collection.insert({ a: 5, z: 'yes' }, function (err, newDoc2) {
            collection.indexes.z.tree.getNumberOfKeys().should.equal(1)
            assert.deepEqual(collection.indexes.z.getMatching('yes'), [
              newDoc,
              newDoc2,
            ])

            done()
          })
        })
      })

      it('If the index has a unique constraint, an error is thrown if it is violated and the data is not modified', function (done) {
        collection.ensureIndex({ fieldName: 'z', unique: true })
        collection.indexes.z.tree.getNumberOfKeys().should.equal(0)

        collection.insert({ a: 2, z: 'yes' }, function (err, newDoc) {
          collection.indexes.z.tree.getNumberOfKeys().should.equal(1)
          assert.deepEqual(collection.indexes.z.getMatching('yes'), [newDoc])

          collection.insert({ a: 5, z: 'yes' }, function (err) {
            err.errorType.should.equal('uniqueViolated')
            err.key.should.equal('yes')

            // Index didn't change
            collection.indexes.z.tree.getNumberOfKeys().should.equal(1)
            assert.deepEqual(collection.indexes.z.getMatching('yes'), [newDoc])

            // Data didn't change
            assert.deepEqual(collection.getAllData(), [newDoc])
            collection.loadDatabase(function () {
              collection.getAllData().length.should.equal(1)
              assert.deepEqual(collection.getAllData()[0], newDoc)

              done()
            })
          })
        })
      })

      it('If an index has a unique constraint, other indexes cannot be modified when it raises an error', function (done) {
        collection.ensureIndex({ fieldName: 'nonu1' })
        collection.ensureIndex({ fieldName: 'uni', unique: true })
        collection.ensureIndex({ fieldName: 'nonu2' })

        collection.insert(
          { nonu1: 'yes', nonu2: 'yes2', uni: 'willfail' },
          function (err, newDoc) {
            assert.isNull(err)
            collection.indexes.nonu1.tree.getNumberOfKeys().should.equal(1)
            collection.indexes.uni.tree.getNumberOfKeys().should.equal(1)
            collection.indexes.nonu2.tree.getNumberOfKeys().should.equal(1)

            collection.insert(
              { nonu1: 'no', nonu2: 'no2', uni: 'willfail' },
              function (err) {
                err.errorType.should.equal('uniqueViolated')

                // No index was modified
                collection.indexes.nonu1.tree.getNumberOfKeys().should.equal(1)
                collection.indexes.uni.tree.getNumberOfKeys().should.equal(1)
                collection.indexes.nonu2.tree.getNumberOfKeys().should.equal(1)

                assert.deepEqual(collection.indexes.nonu1.getMatching('yes'), [
                  newDoc,
                ])
                assert.deepEqual(
                  collection.indexes.uni.getMatching('willfail'),
                  [newDoc],
                )
                assert.deepEqual(collection.indexes.nonu2.getMatching('yes2'), [
                  newDoc,
                ])

                done()
              },
            )
          },
        )
      })

      it('Unique indexes prevent you from inserting two docs where the field is undefined except if theyre sparse', function (done) {
        collection.ensureIndex({ fieldName: 'zzz', unique: true })
        collection.indexes.zzz.tree.getNumberOfKeys().should.equal(0)

        collection.insert({ a: 2, z: 'yes' }, function (err, newDoc) {
          collection.indexes.zzz.tree.getNumberOfKeys().should.equal(1)
          assert.deepEqual(collection.indexes.zzz.getMatching(undefined), [
            newDoc,
          ])

          collection.insert({ a: 5, z: 'other' }, function (err) {
            err.errorType.should.equal('uniqueViolated')
            assert.isUndefined(err.key)

            collection.ensureIndex({
              fieldName: 'yyy',
              unique: true,
              sparse: true,
            })

            collection.insert({ a: 5, z: 'other', zzz: 'set' }, function (err) {
              assert.isNull(err)
              collection.indexes.yyy.getAll().length.should.equal(0) // Nothing indexed
              collection.indexes.zzz.getAll().length.should.equal(2)

              done()
            })
          })
        })
      })

      it('Insertion still works as before with indexing', function (done) {
        collection.ensureIndex({ fieldName: 'a' })
        collection.ensureIndex({ fieldName: 'b' })

        collection.insert({ a: 1, b: 'hello' }, function (err, doc1) {
          collection.insert({ a: 2, b: 'si' }, function (err, doc2) {
            collection.find({}, function (err, docs) {
              assert.deepEqual(
                doc1,
                _.find(docs, function (d) {
                  return d._id === doc1._id
                }),
              )
              assert.deepEqual(
                doc2,
                _.find(docs, function (d) {
                  return d._id === doc2._id
                }),
              )

              done()
            })
          })
        })
      })

      it('All indexes point to the same data as the main index on _id', function (done) {
        collection.ensureIndex({ fieldName: 'a' })

        collection.insert({ a: 1, b: 'hello' }, function (err, doc1) {
          collection.insert({ a: 2, b: 'si' }, function (err, doc2) {
            collection.find({}, function (err, docs) {
              docs.length.should.equal(2)
              collection.getAllData().length.should.equal(2)

              collection.indexes._id
                .getMatching(doc1._id)
                .length.should.equal(1)
              collection.indexes.a.getMatching(1).length.should.equal(1)
              collection.indexes._id
                .getMatching(doc1._id)[0]
                .should.equal(collection.indexes.a.getMatching(1)[0])

              collection.indexes._id
                .getMatching(doc2._id)
                .length.should.equal(1)
              collection.indexes.a.getMatching(2).length.should.equal(1)
              collection.indexes._id
                .getMatching(doc2._id)[0]
                .should.equal(collection.indexes.a.getMatching(2)[0])

              done()
            })
          })
        })
      })

      it('If a unique constraint is violated, no index is changed, including the main one', function (done) {
        collection.ensureIndex({ fieldName: 'a', unique: true })

        collection.insert({ a: 1, b: 'hello' }, function (err, doc1) {
          collection.insert({ a: 1, b: 'si' }, function (err) {
            assert.isDefined(err)

            collection.find({}, function (err, docs) {
              docs.length.should.equal(1)
              collection.getAllData().length.should.equal(1)

              collection.indexes._id
                .getMatching(doc1._id)
                .length.should.equal(1)
              collection.indexes.a.getMatching(1).length.should.equal(1)
              collection.indexes._id
                .getMatching(doc1._id)[0]
                .should.equal(collection.indexes.a.getMatching(1)[0])

              collection.indexes.a.getMatching(2).length.should.equal(0)

              done()
            })
          })
        })
      })
    }) // ==== End of 'Indexing newly inserted documents' ==== //

    describe('Updating indexes upon document update', function () {
      it('Updating docs still works as before with indexing', function (done) {
        collection.ensureIndex({ fieldName: 'a' })

        collection.insert({ a: 1, b: 'hello' }, function (err, _doc1) {
          collection.insert({ a: 2, b: 'si' }, function (err, _doc2) {
            collection.update(
              { a: 1 },
              { $set: { a: 456, b: 'no' } },
              {},
              function (err, nr) {
                const data = collection.getAllData(),
                  doc1 = _.find(data, function (doc) {
                    return doc._id === _doc1._id
                  }),
                  doc2 = _.find(data, function (doc) {
                    return doc._id === _doc2._id
                  })
                assert.isNull(err)
                nr.should.equal(1)

                data.length.should.equal(2)
                assert.deepEqual(doc1, { a: 456, b: 'no', _id: _doc1._id })
                assert.deepEqual(doc2, { a: 2, b: 'si', _id: _doc2._id })

                collection.update(
                  {},
                  { $inc: { a: 10 }, $set: { b: 'same' } },
                  { multi: true },
                  function (err, nr) {
                    const data = collection.getAllData(),
                      doc1 = _.find(data, function (doc) {
                        return doc._id === _doc1._id
                      }),
                      doc2 = _.find(data, function (doc) {
                        return doc._id === _doc2._id
                      })
                    assert.isNull(err)
                    nr.should.equal(2)

                    data.length.should.equal(2)
                    assert.deepEqual(doc1, {
                      a: 466,
                      b: 'same',
                      _id: _doc1._id,
                    })
                    assert.deepEqual(doc2, { a: 12, b: 'same', _id: _doc2._id })

                    done()
                  },
                )
              },
            )
          })
        })
      })

      it('Indexes get updated when a document (or multiple documents) is updated', function (done) {
        collection.ensureIndex({ fieldName: 'a' })
        collection.ensureIndex({ fieldName: 'b' })

        collection.insert({ a: 1, b: 'hello' }, function (err, doc1) {
          collection.insert({ a: 2, b: 'si' }, function (err, doc2) {
            // Simple update
            collection.update(
              { a: 1 },
              { $set: { a: 456, b: 'no' } },
              {},
              function (err, nr) {
                assert.isNull(err)
                nr.should.equal(1)

                collection.indexes.a.tree.getNumberOfKeys().should.equal(2)
                collection.indexes.a
                  .getMatching(456)[0]
                  ._id.should.equal(doc1._id)
                collection.indexes.a
                  .getMatching(2)[0]
                  ._id.should.equal(doc2._id)

                collection.indexes.b.tree.getNumberOfKeys().should.equal(2)
                collection.indexes.b
                  .getMatching('no')[0]
                  ._id.should.equal(doc1._id)
                collection.indexes.b
                  .getMatching('si')[0]
                  ._id.should.equal(doc2._id)

                // The same pointers are shared between all indexes
                collection.indexes.a.tree.getNumberOfKeys().should.equal(2)
                collection.indexes.b.tree.getNumberOfKeys().should.equal(2)
                collection.indexes._id.tree.getNumberOfKeys().should.equal(2)
                collection.indexes.a
                  .getMatching(456)[0]
                  .should.equal(collection.indexes._id.getMatching(doc1._id)[0])
                collection.indexes.b
                  .getMatching('no')[0]
                  .should.equal(collection.indexes._id.getMatching(doc1._id)[0])
                collection.indexes.a
                  .getMatching(2)[0]
                  .should.equal(collection.indexes._id.getMatching(doc2._id)[0])
                collection.indexes.b
                  .getMatching('si')[0]
                  .should.equal(collection.indexes._id.getMatching(doc2._id)[0])

                // Multi update
                collection.update(
                  {},
                  { $inc: { a: 10 }, $set: { b: 'same' } },
                  { multi: true },
                  function (err, nr) {
                    assert.isNull(err)
                    nr.should.equal(2)

                    collection.indexes.a.tree.getNumberOfKeys().should.equal(2)
                    collection.indexes.a
                      .getMatching(466)[0]
                      ._id.should.equal(doc1._id)
                    collection.indexes.a
                      .getMatching(12)[0]
                      ._id.should.equal(doc2._id)

                    collection.indexes.b.tree.getNumberOfKeys().should.equal(1)
                    collection.indexes.b
                      .getMatching('same')
                      .length.should.equal(2)
                    pluck(
                      collection.indexes.b.getMatching('same'),
                      '_id',
                    ).should.contain(doc1._id)
                    pluck(
                      collection.indexes.b.getMatching('same'),
                      '_id',
                    ).should.contain(doc2._id)

                    // The same pointers are shared between all indexes
                    collection.indexes.a.tree.getNumberOfKeys().should.equal(2)
                    collection.indexes.b.tree.getNumberOfKeys().should.equal(1)
                    collection.indexes.b.getAll().length.should.equal(2)
                    collection.indexes._id.tree
                      .getNumberOfKeys()
                      .should.equal(2)
                    collection.indexes.a
                      .getMatching(466)[0]
                      .should.equal(
                        collection.indexes._id.getMatching(doc1._id)[0],
                      )
                    collection.indexes.a
                      .getMatching(12)[0]
                      .should.equal(
                        collection.indexes._id.getMatching(doc2._id)[0],
                      )
                    // Can't test the pointers in b as their order is randomized, but it is the same as with a

                    done()
                  },
                )
              },
            )
          })
        })
      })

      it('If a simple update violates a contraint, all changes are rolled back and an error is thrown', function (done) {
        collection.ensureIndex({ fieldName: 'a', unique: true })
        collection.ensureIndex({ fieldName: 'b', unique: true })
        collection.ensureIndex({ fieldName: 'c', unique: true })

        collection.insert({ a: 1, b: 10, c: 100 }, function (err, _doc1) {
          collection.insert({ a: 2, b: 20, c: 200 }, function (err, _doc2) {
            collection.insert({ a: 3, b: 30, c: 300 }, function (err, _doc3) {
              // Will conflict with doc3
              collection.update(
                { a: 2 },
                { $inc: { a: 10, c: 1000 }, $set: { b: 30 } },
                {},
                function (err) {
                  const data = collection.getAllData(),
                    doc1 = _.find(data, function (doc) {
                      return doc._id === _doc1._id
                    }),
                    doc2 = _.find(data, function (doc) {
                      return doc._id === _doc2._id
                    }),
                    doc3 = _.find(data, function (doc) {
                      return doc._id === _doc3._id
                    })
                  err.errorType.should.equal('uniqueViolated')

                  // Data left unchanged
                  data.length.should.equal(3)
                  assert.deepEqual(doc1, {
                    a: 1,
                    b: 10,
                    c: 100,
                    _id: _doc1._id,
                  })
                  assert.deepEqual(doc2, {
                    a: 2,
                    b: 20,
                    c: 200,
                    _id: _doc2._id,
                  })
                  assert.deepEqual(doc3, {
                    a: 3,
                    b: 30,
                    c: 300,
                    _id: _doc3._id,
                  })

                  // All indexes left unchanged and pointing to the same docs
                  collection.indexes.a.tree.getNumberOfKeys().should.equal(3)
                  collection.indexes.a.getMatching(1)[0].should.equal(doc1)
                  collection.indexes.a.getMatching(2)[0].should.equal(doc2)
                  collection.indexes.a.getMatching(3)[0].should.equal(doc3)

                  collection.indexes.b.tree.getNumberOfKeys().should.equal(3)
                  collection.indexes.b.getMatching(10)[0].should.equal(doc1)
                  collection.indexes.b.getMatching(20)[0].should.equal(doc2)
                  collection.indexes.b.getMatching(30)[0].should.equal(doc3)

                  collection.indexes.c.tree.getNumberOfKeys().should.equal(3)
                  collection.indexes.c.getMatching(100)[0].should.equal(doc1)
                  collection.indexes.c.getMatching(200)[0].should.equal(doc2)
                  collection.indexes.c.getMatching(300)[0].should.equal(doc3)

                  done()
                },
              )
            })
          })
        })
      })

      it('If a multi update violates a contraint, all changes are rolled back and an error is thrown', function (done) {
        collection.ensureIndex({ fieldName: 'a', unique: true })
        collection.ensureIndex({ fieldName: 'b', unique: true })
        collection.ensureIndex({ fieldName: 'c', unique: true })

        collection.insert({ a: 1, b: 10, c: 100 }, function (err, _doc1) {
          collection.insert({ a: 2, b: 20, c: 200 }, function (err, _doc2) {
            collection.insert({ a: 3, b: 30, c: 300 }, function (err, _doc3) {
              // Will conflict with doc3
              collection.update(
                { a: { $in: [1, 2] } },
                { $inc: { a: 10, c: 1000 }, $set: { b: 30 } },
                { multi: true },
                function (err) {
                  const data = collection.getAllData(),
                    doc1 = _.find(data, function (doc) {
                      return doc._id === _doc1._id
                    }),
                    doc2 = _.find(data, function (doc) {
                      return doc._id === _doc2._id
                    }),
                    doc3 = _.find(data, function (doc) {
                      return doc._id === _doc3._id
                    })
                  err.errorType.should.equal('uniqueViolated')

                  // Data left unchanged
                  data.length.should.equal(3)
                  assert.deepEqual(doc1, {
                    a: 1,
                    b: 10,
                    c: 100,
                    _id: _doc1._id,
                  })
                  assert.deepEqual(doc2, {
                    a: 2,
                    b: 20,
                    c: 200,
                    _id: _doc2._id,
                  })
                  assert.deepEqual(doc3, {
                    a: 3,
                    b: 30,
                    c: 300,
                    _id: _doc3._id,
                  })

                  // All indexes left unchanged and pointing to the same docs
                  collection.indexes.a.tree.getNumberOfKeys().should.equal(3)
                  collection.indexes.a.getMatching(1)[0].should.equal(doc1)
                  collection.indexes.a.getMatching(2)[0].should.equal(doc2)
                  collection.indexes.a.getMatching(3)[0].should.equal(doc3)

                  collection.indexes.b.tree.getNumberOfKeys().should.equal(3)
                  collection.indexes.b.getMatching(10)[0].should.equal(doc1)
                  collection.indexes.b.getMatching(20)[0].should.equal(doc2)
                  collection.indexes.b.getMatching(30)[0].should.equal(doc3)

                  collection.indexes.c.tree.getNumberOfKeys().should.equal(3)
                  collection.indexes.c.getMatching(100)[0].should.equal(doc1)
                  collection.indexes.c.getMatching(200)[0].should.equal(doc2)
                  collection.indexes.c.getMatching(300)[0].should.equal(doc3)

                  done()
                },
              )
            })
          })
        })
      })
    }) // ==== End of 'Updating indexes upon document update' ==== //

    describe('Updating indexes upon document remove', function () {
      it('Removing docs still works as before with indexing', function (done) {
        collection.ensureIndex({ fieldName: 'a' })

        collection.insert({ a: 1, b: 'hello' }, function (err, _doc1) {
          collection.insert({ a: 2, b: 'si' }, function (err, _doc2) {
            collection.insert({ a: 3, b: 'coin' }, function (err, _doc3) {
              collection.remove({ a: 1 }, {}, function (err, nr) {
                const data = collection.getAllData(),
                  doc2 = _.find(data, function (doc) {
                    return doc._id === _doc2._id
                  }),
                  doc3 = _.find(data, function (doc) {
                    return doc._id === _doc3._id
                  })
                assert.isNull(err)
                nr.should.equal(1)

                data.length.should.equal(2)
                assert.deepEqual(doc2, { a: 2, b: 'si', _id: _doc2._id })
                assert.deepEqual(doc3, { a: 3, b: 'coin', _id: _doc3._id })

                collection.remove(
                  { a: { $in: [2, 3] } },
                  { multi: true },
                  function (err, nr) {
                    const data = collection.getAllData()
                    assert.isNull(err)
                    nr.should.equal(2)
                    data.length.should.equal(0)

                    done()
                  },
                )
              })
            })
          })
        })
      })

      it('Indexes get updated when a document (or multiple documents) is removed', function (done) {
        collection.ensureIndex({ fieldName: 'a' })
        collection.ensureIndex({ fieldName: 'b' })

        collection.insert({ a: 1, b: 'hello' }, function () {
          collection.insert({ a: 2, b: 'si' }, function (err, doc2) {
            collection.insert({ a: 3, b: 'coin' }, function (err, doc3) {
              // Simple remove
              collection.remove({ a: 1 }, {}, function (err, nr) {
                assert.isNull(err)
                nr.should.equal(1)

                collection.indexes.a.tree.getNumberOfKeys().should.equal(2)
                collection.indexes.a
                  .getMatching(2)[0]
                  ._id.should.equal(doc2._id)
                collection.indexes.a
                  .getMatching(3)[0]
                  ._id.should.equal(doc3._id)

                collection.indexes.b.tree.getNumberOfKeys().should.equal(2)
                collection.indexes.b
                  .getMatching('si')[0]
                  ._id.should.equal(doc2._id)
                collection.indexes.b
                  .getMatching('coin')[0]
                  ._id.should.equal(doc3._id)

                // The same pointers are shared between all indexes
                collection.indexes.a.tree.getNumberOfKeys().should.equal(2)
                collection.indexes.b.tree.getNumberOfKeys().should.equal(2)
                collection.indexes._id.tree.getNumberOfKeys().should.equal(2)
                collection.indexes.a
                  .getMatching(2)[0]
                  .should.equal(collection.indexes._id.getMatching(doc2._id)[0])
                collection.indexes.b
                  .getMatching('si')[0]
                  .should.equal(collection.indexes._id.getMatching(doc2._id)[0])
                collection.indexes.a
                  .getMatching(3)[0]
                  .should.equal(collection.indexes._id.getMatching(doc3._id)[0])
                collection.indexes.b
                  .getMatching('coin')[0]
                  .should.equal(collection.indexes._id.getMatching(doc3._id)[0])

                // Multi remove
                collection.remove({}, { multi: true }, function (err, nr) {
                  assert.isNull(err)
                  nr.should.equal(2)

                  collection.indexes.a.tree.getNumberOfKeys().should.equal(0)
                  collection.indexes.b.tree.getNumberOfKeys().should.equal(0)
                  collection.indexes._id.tree.getNumberOfKeys().should.equal(0)

                  done()
                })
              })
            })
          })
        })
      })
    }) // ==== End of 'Updating indexes upon document remove' ==== //

    describe('Persisting indexes', function () {
      it('Indexes are persisted to a separate file and recreated upon reload', function (done) {
        const persDb = 'workspace/persistIndexes.db'

        if (fs.existsSync(persDb)) {
          fs.writeFileSync(persDb, '', 'utf8')
        }

        let db = new Collection({ filename: persDb, autoload: true })

        Object.keys(db.indexes).length.should.equal(1)
        Object.keys(db.indexes)[0].should.equal('_id')

        db.insert({ planet: 'Earth' }, function (err) {
          assert.isNull(err)
          db.insert({ planet: 'Mars' }, function (err) {
            assert.isNull(err)

            db.ensureIndex({ fieldName: 'planet' }, function () {
              Object.keys(db.indexes).length.should.equal(2)
              Object.keys(db.indexes)[0].should.equal('_id')
              Object.keys(db.indexes)[1].should.equal('planet')
              db.indexes._id.getAll().length.should.equal(2)
              db.indexes.planet.getAll().length.should.equal(2)
              db.indexes.planet.fieldName.should.equal('planet')

              // After a reload the indexes are recreated
              db = new Collection({ filename: persDb })
              db.loadDatabase(function (err) {
                assert.isNull(err)
                Object.keys(db.indexes).length.should.equal(2)
                Object.keys(db.indexes)[0].should.equal('_id')
                Object.keys(db.indexes)[1].should.equal('planet')
                db.indexes._id.getAll().length.should.equal(2)
                db.indexes.planet.getAll().length.should.equal(2)
                db.indexes.planet.fieldName.should.equal('planet')

                // After another reload the indexes are still there (i.e. they are preserved during autocompaction)
                db = new Collection({ filename: persDb })
                db.loadDatabase(function (err) {
                  assert.isNull(err)
                  Object.keys(db.indexes).length.should.equal(2)
                  Object.keys(db.indexes)[0].should.equal('_id')
                  Object.keys(db.indexes)[1].should.equal('planet')
                  db.indexes._id.getAll().length.should.equal(2)
                  db.indexes.planet.getAll().length.should.equal(2)
                  db.indexes.planet.fieldName.should.equal('planet')

                  done()
                })
              })
            })
          })
        })
      })

      it('Indexes are persisted with their options and recreated even if some db operation happen between loads', function (done) {
        const persDb = 'workspace/persistIndexes.db'
        let db

        if (fs.existsSync(persDb)) {
          fs.writeFileSync(persDb, '', 'utf8')
        }
        db = new Collection({ filename: persDb, autoload: true })

        Object.keys(db.indexes).length.should.equal(1)
        Object.keys(db.indexes)[0].should.equal('_id')

        db.insert({ planet: 'Earth' }, function (err) {
          assert.isNull(err)
          db.insert({ planet: 'Mars' }, function (err) {
            assert.isNull(err)

            db.ensureIndex(
              { fieldName: 'planet', unique: true, sparse: false },
              function () {
                Object.keys(db.indexes).length.should.equal(2)
                Object.keys(db.indexes)[0].should.equal('_id')
                Object.keys(db.indexes)[1].should.equal('planet')
                db.indexes._id.getAll().length.should.equal(2)
                db.indexes.planet.getAll().length.should.equal(2)
                db.indexes.planet.unique.should.equal(true)
                db.indexes.planet.sparse.should.equal(false)

                db.insert({ planet: 'Jupiter' }, function (err) {
                  assert.isNull(err)

                  // After a reload the indexes are recreated
                  db = new Collection({ filename: persDb })
                  db.loadDatabase(function (err) {
                    assert.isNull(err)
                    Object.keys(db.indexes).length.should.equal(2)
                    Object.keys(db.indexes)[0].should.equal('_id')
                    Object.keys(db.indexes)[1].should.equal('planet')
                    db.indexes._id.getAll().length.should.equal(3)
                    db.indexes.planet.getAll().length.should.equal(3)
                    db.indexes.planet.unique.should.equal(true)
                    db.indexes.planet.sparse.should.equal(false)

                    db.ensureIndex(
                      { fieldName: 'bloup', unique: false, sparse: true },
                      function (err) {
                        assert.isNull(err)
                        Object.keys(db.indexes).length.should.equal(3)
                        Object.keys(db.indexes)[0].should.equal('_id')
                        Object.keys(db.indexes)[1].should.equal('planet')
                        Object.keys(db.indexes)[2].should.equal('bloup')
                        db.indexes._id.getAll().length.should.equal(3)
                        db.indexes.planet.getAll().length.should.equal(3)
                        db.indexes.bloup.getAll().length.should.equal(0)
                        db.indexes.planet.unique.should.equal(true)
                        db.indexes.planet.sparse.should.equal(false)
                        db.indexes.bloup.unique.should.equal(false)
                        db.indexes.bloup.sparse.should.equal(true)

                        // After another reload the indexes are still there (i.e. they are preserved during autocompaction)
                        db = new Collection({ filename: persDb })
                        db.loadDatabase(function (err) {
                          assert.isNull(err)
                          Object.keys(db.indexes).length.should.equal(3)
                          Object.keys(db.indexes)[0].should.equal('_id')
                          Object.keys(db.indexes)[1].should.equal('planet')
                          Object.keys(db.indexes)[2].should.equal('bloup')
                          db.indexes._id.getAll().length.should.equal(3)
                          db.indexes.planet.getAll().length.should.equal(3)
                          db.indexes.bloup.getAll().length.should.equal(0)
                          db.indexes.planet.unique.should.equal(true)
                          db.indexes.planet.sparse.should.equal(false)
                          db.indexes.bloup.unique.should.equal(false)
                          db.indexes.bloup.sparse.should.equal(true)

                          done()
                        })
                      },
                    )
                  })
                })
              },
            )
          })
        })
      })

      it('Indexes can also be removed and the remove persisted', function (done) {
        const persDb = 'workspace/persistIndexes.db'
        let db

        if (fs.existsSync(persDb)) {
          fs.writeFileSync(persDb, '', 'utf8')
        }
        db = new Collection({ filename: persDb, autoload: true })

        Object.keys(db.indexes).length.should.equal(1)
        Object.keys(db.indexes)[0].should.equal('_id')

        db.insert({ planet: 'Earth' }, function (err) {
          assert.isNull(err)
          db.insert({ planet: 'Mars' }, function (err) {
            assert.isNull(err)

            db.ensureIndex({ fieldName: 'planet' }, function (err) {
              assert.isNull(err)
              db.ensureIndex({ fieldName: 'another' }, function (err) {
                assert.isNull(err)
                Object.keys(db.indexes).length.should.equal(3)
                Object.keys(db.indexes)[0].should.equal('_id')
                Object.keys(db.indexes)[1].should.equal('planet')
                Object.keys(db.indexes)[2].should.equal('another')
                db.indexes._id.getAll().length.should.equal(2)
                db.indexes.planet.getAll().length.should.equal(2)
                db.indexes.planet.fieldName.should.equal('planet')

                // After a reload the indexes are recreated
                db = new Collection({ filename: persDb })
                db.loadDatabase(function (err) {
                  assert.isNull(err)
                  Object.keys(db.indexes).length.should.equal(3)
                  Object.keys(db.indexes)[0].should.equal('_id')
                  Object.keys(db.indexes)[1].should.equal('planet')
                  Object.keys(db.indexes)[2].should.equal('another')
                  db.indexes._id.getAll().length.should.equal(2)
                  db.indexes.planet.getAll().length.should.equal(2)
                  db.indexes.planet.fieldName.should.equal('planet')

                  // Index is removed
                  db.removeIndex('planet', function (err) {
                    assert.isNull(err)
                    Object.keys(db.indexes).length.should.equal(2)
                    Object.keys(db.indexes)[0].should.equal('_id')
                    Object.keys(db.indexes)[1].should.equal('another')
                    db.indexes._id.getAll().length.should.equal(2)

                    // After a reload indexes are preserved
                    db = new Collection({ filename: persDb })
                    db.loadDatabase(function (err) {
                      assert.isNull(err)
                      Object.keys(db.indexes).length.should.equal(2)
                      Object.keys(db.indexes)[0].should.equal('_id')
                      Object.keys(db.indexes)[1].should.equal('another')
                      db.indexes._id.getAll().length.should.equal(2)

                      // After another reload the indexes are still there (i.e. they are preserved during autocompaction)
                      db = new Collection({ filename: persDb })
                      db.loadDatabase(function (err) {
                        assert.isNull(err)
                        Object.keys(db.indexes).length.should.equal(2)
                        Object.keys(db.indexes)[0].should.equal('_id')
                        Object.keys(db.indexes)[1].should.equal('another')
                        db.indexes._id.getAll().length.should.equal(2)

                        done()
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    }) // ==== End of 'Persisting indexes' ====

    it('Results of getMatching should never contain duplicates', function (done) {
      collection.ensureIndex({ fieldName: 'bad' })
      collection.insert({ bad: ['a', 'b'] }, function () {
        collection.getCandidates(
          { bad: { $in: ['a', 'b'] } },
          function (err, res) {
            res.length.should.equal(1)
            done()
          },
        )
      })
    })
  }) // ==== End of 'Using indexes' ==== //
})

import { expect, describe, it, beforeEach, assert } from 'vitest'
import fs from 'fs'
import each from 'lodash/each'
import find from 'lodash/find'
import isEqual from 'lodash/isEqual'
import { mkdirp } from 'mkdirp'
import path from 'path'
import { Collection, CollectionEvent, createCollection } from './collection'
import { NodeStorage } from './node'
import { serialize } from './serialization'
import { pluck } from './utils'

const testDb = path.join('workspace', 'test.db'),
  reloadTimeUpperBound = 60 // In ms, an upper bound for the reload time used to check createdAt and updatedAt

describe('Database', () => {
  let collection: Collection

  beforeEach(async () => {
    collection = new Collection({
      name: testDb,
      storage: new NodeStorage(),
    })
    expect(collection.name).toEqual(testDb)
    expect(collection.inMemoryOnly).toEqual(false)

    await mkdirp(path.dirname(testDb))

    fs.existsSync(testDb) && fs.unlinkSync(testDb)

    await collection.loadDatabase()

    expect(collection.getAllData()).toHaveLength(0)
  })

  describe('Autoloading', function () {
    it('Can autoload a database and query it right away', async function () {
      const fileStr =
        serialize({ _id: '1', a: 5, planet: 'Earth' }) +
        '\n' +
        serialize({ _id: '2', a: 5, planet: 'Mars' }) +
        '\n'
      const autoDb = 'workspace/auto.db'
      await mkdirp(path.dirname(autoDb))
      fs.writeFileSync(autoDb, fileStr, 'utf8')

      const db = await createCollection({
        name: autoDb,
        autoload: true,
        storage: new NodeStorage(),
      })

      const docs = await db.find({})

      expect(docs).toHaveLength(2)
    })

    it('Throws if autoload fails', async () => {
      const fileStr =
          serialize({ _id: '1', a: 5, planet: 'Earth' }) +
          '\n' +
          serialize({ _id: '2', a: 5, planet: 'Mars' }) +
          '\n' +
          '{"$$indexCreated":{"fieldName":"a","unique":true}}',
        autoDb = 'workspace/auto.db'

      await mkdirp(path.dirname(autoDb))

      fs.writeFileSync(autoDb, fileStr, 'utf8')

      let errorCaught = false
      let errorEventCaught = false

      await new Promise<void>(resolve => {
        const db = new Collection({
          name: autoDb,
          storage: new NodeStorage(),
          autoload: true,
          onload: err => {
            expect(err).toBeInstanceOf(Error)
            expect(err.message).toEqual('Unique Constraint Violation')
            errorCaught = true

            // needs to give time for the error event to be caught
            setTimeout(() => {
              resolve()
            }, 100)
          },
        })

        // also handle the error event to prevent unhandled rejection warning
        db.on(CollectionEvent.ERROR, err => {
          errorEventCaught = true
          expect(err).toBeInstanceOf(Error)
        })
      })

      expect(errorCaught).toBe(true)
      expect(errorEventCaught).toBe(true)
    })
  })

  describe('Insert', function () {
    it('Able to insert a document in the database, setting an _id if none provided, and retrieve it even after a reload', async () => {
      let docs = await collection.find({})
      expect(docs).toHaveLength(0)

      await collection.insert({ somedata: 'ok' })

      // The data was correctly updated
      docs = await collection.find({})
      expect(docs).toHaveLength(1)
      expect(Object.keys(docs[0])).toHaveLength(2)
      expect(docs[0].somedata).toEqual('ok')
      assert.isDefined(docs[0]._id)

      // After a reload, the data has been correctly persisted
      await collection.loadDatabase()
      docs = await collection.find({})
      expect(docs).toHaveLength(1)
      expect(Object.keys(docs[0])).toHaveLength(2)
      expect(docs[0].somedata).toEqual('ok')
      assert.isDefined(docs[0]._id)
    })

    it('Can insert multiple documents in the database', async function () {
      const docs = await collection.find({})
      expect(docs).toHaveLength(0)

      await collection.insert({ somedata: 'ok' })
      await collection.insert({ somedata: 'another' })
      await collection.insert({ somedata: 'again' })

      const newDocs = await collection.find({})
      expect(newDocs).toHaveLength(3)
      expect(pluck(newDocs, 'somedata')).toContain('ok')
      expect(pluck(newDocs, 'somedata')).toContain('another')
      expect(pluck(newDocs, 'somedata')).toContain('again')
    })

    it('Can insert and get back from DB complex objects with all primitive and secondary types', async function () {
      const da = new Date(),
        obj = { a: ['ee', 'ff', 42], date: da, subobj: { a: 'b', b: 'c' } }
      await collection.insert(obj)
      const res = await collection.findOne({})

      expect(res.a).toHaveLength(3)
      expect(res.a[0]).toEqual('ee')
      expect(res.a[1]).toEqual('ff')
      expect(res.a[2]).toEqual(42)
      expect(res.date.getTime()).toEqual(da.getTime())
      expect(res.subobj.a).toEqual('b')
      expect(res.subobj.b).toEqual('c')
    })

    it('If an object returned from the DB is modified and refetched, the original value should be found', async function () {
      await collection.insert({ a: 'something' })
      let doc = await collection.findOne({})
      expect(doc.a).toEqual('something')
      doc.a = 'another thing'
      expect(doc.a).toEqual('another thing')

      // Re-fetching with findOne should yield the persisted value
      doc = await collection.findOne({})
      expect(doc.a).toEqual('something')
      doc.a = 'another thing'
      expect(doc.a).toEqual('another thing')

      // Re-fetching with find should yield the persisted value
      const docs = await collection.find({})
      expect(docs[0].a).toEqual('something')
    })

    it('Cannot insert a doc that has a field beginning with a $ sign', async function () {
      await expect(collection.insert({ $something: 'atest' })).rejects.toThrow()
    })

    it('If an _id is already given when we insert a document, use that instead of generating a random one', async function () {
      const newDoc = await collection.insert({ _id: 'test', stuff: true })
      expect(newDoc.stuff).toEqual(true)
      expect(newDoc._id).toEqual('test')

      try {
        await collection.insert({ _id: 'test', otherstuff: 42 })
      } catch (err) {
        expect(err.message).toEqual('Unique Constraint Violation')
      }
    })

    it('Modifying the insertedDoc after an insert doesnt change the copy saved in the database', async function () {
      const newDoc = await collection.insert({ a: 2, hello: 'world' })
      newDoc.hello = 'changed'
      const doc = await collection.findOne({ a: 2 })
      expect(doc.hello).toEqual('world')
    })

    it('If timestampData option is set, a createdAt field is added and persisted', async function () {
      const newDoc = { hello: 'world' }
      const beginning = Date.now()

      collection = await createCollection({
        name: testDb,
        timestamps: true,
        autoload: true,
        storage: new NodeStorage(),
      })

      let docs = await collection.find({})
      expect(docs).toHaveLength(0)

      const insertedDoc = await collection.insert(newDoc)
      assert.deepEqual(newDoc, { hello: 'world' })
      expect(insertedDoc.hello).toEqual('world')
      assert.isDefined(insertedDoc.createdAt)
      assert.isDefined(insertedDoc.updatedAt)
      expect(insertedDoc.createdAt).toEqual(insertedDoc.updatedAt)
      assert.isDefined(insertedDoc._id)
      expect(Object.keys(insertedDoc)).toHaveLength(4)
      assert.isBelow(
        Math.abs(insertedDoc.createdAt.getTime() - beginning),
        reloadTimeUpperBound,
      )

      insertedDoc.bloup = 'another'
      expect(Object.keys(insertedDoc)).toHaveLength(5)

      docs = await collection.find({})
      expect(docs).toHaveLength(1)
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

      docs = await collection.find({})
      expect(docs).toHaveLength(1)
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
      expect(Object.keys(insertedDoc)).toHaveLength(2)
      assert.isUndefined(insertedDoc.createdAt)
      assert.isUndefined(insertedDoc.updatedAt)

      const docs = await collection.find({})
      expect(docs).toHaveLength(1)
      assert.deepEqual(docs[0], insertedDoc)
    })

    it("If timestampData is set but createdAt is specified by user, don't change it", async function () {
      const newDoc = { hello: 'world', createdAt: new Date(234) }
      const beginning = Date.now()

      collection = await createCollection({
        name: testDb,
        timestamps: true,
        autoload: true,
        storage: new NodeStorage(),
      })

      const insertedDoc = await collection.insert(newDoc)

      expect(Object.keys(insertedDoc)).toHaveLength(4)

      expect(insertedDoc.createdAt.getTime()).toEqual(234) // Not modified

      assert.isBelow(
        insertedDoc.updatedAt.getTime() - beginning,
        reloadTimeUpperBound,
      ) // Created

      const docs = await collection.find({})
      assert.deepEqual(insertedDoc, docs[0])

      await collection.loadDatabase()

      const reloadedDocs = await collection.find({})
      assert.deepEqual(insertedDoc, reloadedDocs[0])
    })

    it("If timestampData is set but updatedAt is specified by user, don't change it", async function () {
      const newDoc = { hello: 'world', updatedAt: new Date(234) },
        beginning = Date.now()

      collection = await createCollection({
        name: testDb,
        timestamps: true,
        autoload: true,
        storage: new NodeStorage(),
      })

      const insertedDoc = await collection.insert(newDoc)

      expect(Object.keys(insertedDoc)).toHaveLength(4)
      expect(insertedDoc.updatedAt.getTime()).toEqual(234) // Not modified
      assert.isBelow(
        insertedDoc.createdAt.getTime() - beginning,
        reloadTimeUpperBound,
      ) // Created

      const docs = await collection.find({})
      assert.deepEqual(insertedDoc, docs[0])

      await collection.loadDatabase()

      const updatedDocs = await collection.find({})
      assert.deepEqual(insertedDoc, updatedDocs[0])
    })

    it('Can insert a doc with id 0', async function () {
      const doc = await collection.insert({ _id: 0, hello: 'world' })
      expect(doc._id).toEqual(0)
      expect(doc.hello).toEqual('world')
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

      expect(data).toHaveLength(2)
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

      const doc1 = find(data, function (d) {
        return d._id === _doc1._id
      })
      const doc2 = find(data, function (d) {
        return d._id === _doc2._id
      })
      const doc3 = find(data, function (d) {
        return d._id === _doc3._id
      })
      const doc4 = find(data, function (d) {
        return d._id === _doc4._id
      })

      expect(data).toHaveLength(4)
      assert.deepEqual(doc1, { _id: doc1._id, tf: 4 })
      assert.deepEqual(doc2, { _id: doc2._id, tf: 6 })
      assert.deepEqual(doc3, { _id: doc3._id, tf: 4, an: 'other' })
      assert.deepEqual(doc4, { _id: doc4._id, tf: 9 })
    })

    it('Can use indexes for comparison matches', async function () {
      await collection.ensureIndex({ fieldName: 'tf' })
      await collection.insert({ tf: 4 })
      const doc2 = await collection.insert({ tf: 6 })
      await collection.insert({ tf: 4, an: 'other' })
      const doc4 = await collection.insert({ tf: 9 })
      const data = await collection.getCandidates({
        r: 6,
        tf: { $lte: 9, $gte: 6 },
      })
      const foundDoc2 = find(data, function (d) {
        return d._id === doc2._id
      })
      const foundDoc4 = find(data, function (d) {
        return d._id === doc4._id
      })
      expect(data).toHaveLength(2)
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
      expect(doc.hello).toEqual('world')

      await new Promise(resolve => setTimeout(resolve, 110))

      doc = await collection.findOne({})
      assert.isNull(doc)

      await collection.persistence.compactDatafile()

      // After compaction, no more mention of the document, correctly removed
      const datafileContents = fs.readFileSync(testDb, 'utf8')

      expect(datafileContents.split('\n')).toHaveLength(2)
      assert.isNull(datafileContents.match(/world/))

      // New datastore on same datafile is empty
      const d2 = await createCollection({ name: testDb, autoload: true })

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

      let docs = await collection.find({})
      expect(docs).toHaveLength(3)

      await new Promise(resolve => setTimeout(resolve, 110))

      docs = await collection.find({})
      expect(docs).toHaveLength(1)
      expect(docs[0].hello).toEqual('world3')

      await new Promise(resolve => setTimeout(resolve, 110))

      docs = await collection.find({})
      expect(docs).toHaveLength(0)
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

      let docs = await collection.find()
      expect(docs).toHaveLength(3)

      await new Promise(resolve => setTimeout(resolve, 110))

      docs = await collection.find()
      expect(docs).toHaveLength(2)
      expect(docs[0].hello).not.toEqual('world1')
      expect(docs[1].hello).not.toEqual('world1')
    })
  })

  describe('Find', function () {
    it('Can find all documents if an empty query is used', async function () {
      await collection.insert({ somedata: 'ok' })
      await collection.insert({ somedata: 'another', plus: 'additional data' })
      await collection.insert({ somedata: 'again' })

      const docs = await collection.find({})
      expect(docs).toHaveLength(3)
      expect(pluck(docs, 'somedata')).toContain('ok')
      expect(pluck(docs, 'somedata')).toContain('another')
      expect(
        find(docs, function (d) {
          return d.somedata === 'another'
        }).plus,
      ).toEqual('additional data')
      expect(pluck(docs, 'somedata')).toContain('again')
    })

    it('Can find all documents matching a basic query', async function () {
      await collection.insert({ somedata: 'ok' })
      await collection.insert({ somedata: 'again', plus: 'additional data' })
      await collection.insert({ somedata: 'again' })

      // Test with query that will return docs
      let docs = await collection.find({ somedata: 'again' })
      expect(docs).toHaveLength(2)
      expect(pluck(docs, 'somedata')).not.toContain('ok')

      // Test with query that doesn't match anything
      docs = await collection.find({ somedata: 'nope' })
      expect(docs).toHaveLength(0)
    })

    it('Can find one document matching a basic query and return null if none is found', async function () {
      await collection.insert({ somedata: 'ok' })
      await collection.insert({ somedata: 'again', plus: 'additional data' })
      await collection.insert({ somedata: 'again' })

      // Test with query that will return docs
      let doc = await collection.findOne({ somedata: 'ok' })
      expect(Object.keys(doc)).toHaveLength(2)
      expect(doc.somedata).toEqual('ok')
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
      expect(doc.sth.name).toEqual('nedb')

      doc = await collection.findOne({ now: date2 })
      assert.isNull(doc)

      doc = await collection.findOne({ sth: { name: 'nedb' } })
      expect(doc.sth.name).toEqual('nedb')

      doc = await collection.findOne({ sth: { name: 'other' } })
      assert.isNull(doc)
    })

    it('Can use dot-notation to query subfields', async function () {
      await collection.insert({ greeting: { english: 'hello' } })

      let doc = await collection.findOne({ 'greeting.english': 'hello' })
      expect(doc.greeting.english).toEqual('hello')

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

      let docs = await collection.find({ fruits: 'pear' })
      expect(docs).toHaveLength(2)
      expect(pluck(docs, '_id')).toContain(doc1._id)
      expect(pluck(docs, '_id')).toContain(doc2._id)

      docs = await collection.find({ fruits: 'banana' })
      expect(docs).toHaveLength(2)
      expect(pluck(docs, '_id')).toContain(doc1._id)
      expect(pluck(docs, '_id')).toContain(doc3._id)

      docs = await collection.find({ fruits: 'doesntexist' })
      expect(docs).toHaveLength(0)
    })

    it('Returns an error if the query is not well formed', async function () {
      await collection.insert({ hello: 'world' })
      let docs, doc
      let err = null

      try {
        docs = await collection.find({ $or: { hello: 'world' } })
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
      expect(doc.hello).toEqual('world')
      const docs = await collection.find({ a: 2 })
      docs[0].hello = 'changed'
      doc = await collection.findOne({ a: 2 })
      expect(doc.hello).toEqual('world')
    })

    it('Can use projections in find, normal or cursor way', async function () {
      await collection.insert({ a: 2, hello: 'world' })
      await collection.insert({ a: 24, hello: 'earth' })

      let docs = await collection.find({ a: 2 }, { a: 0, _id: 0 })
      expect(docs).toHaveLength(1)
      assert.deepEqual(docs[0], { hello: 'world' })

      docs = await collection.find({ a: 2 }, { a: 0, _id: 0 })
      expect(docs).toHaveLength(1)
      assert.deepEqual(docs[0], { hello: 'world' })

      // Can't use both modes at once if not _id
      let err
      try {
        await collection.find({ a: 2 }, { a: 0, hello: 1 })
      } catch (e) {
        err = e
      }
      assert.isNotNull(err)

      err = null
      try {
        await collection.find({ a: 2 }, { a: 0, hello: 1 })
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
      await expect(
        collection.findOne({ a: 2 }, { a: 0, hello: 1 }),
      ).rejects.toThrow()

      await expect(
        collection.findOne({ a: 2 }, { a: 0, hello: 1 }),
      ).rejects.toThrow()
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
      const docs = await collection.find({ somedata: 'again' })
      let count = await collection.count({ somedata: 'again' })
      expect(count).toEqual(docs.length)

      // Test with query that doesn't match anything
      count = await collection.count({ somedata: 'nope' })
      expect(count).toEqual(0)
    })

    it('Array fields match if any element matches', async function () {
      await collection.insert({ fruits: ['pear', 'apple', 'banana'] })
      await collection.insert({ fruits: ['coconut', 'orange', 'pear'] })
      await collection.insert({ fruits: ['banana'] })

      let docs = await collection.find({ fruits: 'pear' })
      assert.equal(docs.length, 2)

      docs = await collection.find({ fruits: 'banana' })
      assert.equal(docs.length, 2)

      docs = await collection.find({ fruits: 'doesntexist' })
      assert.equal(docs.length, 0)
    })

    it('Returns an error if the query is not well formed', async function () {
      await collection.insert({ hello: 'world' })

      await expect(
        collection.count({ $or: { hello: 'world' } }),
      ).rejects.toThrow()
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

      expect(n.modifiedCount).toEqual(0)

      const docs = await collection.find({})

      const doc1 = find(docs, function (d) {
        return d.somedata === 'ok'
      })
      const doc2 = find(docs, function (d) {
        return d.somedata === 'again'
      })
      const doc3 = find(docs, function (d) {
        return d.somedata === 'another'
      })

      expect(docs).toHaveLength(3)
      assert.isUndefined(
        find(docs, function (d) {
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

      const collection = await createCollection({
        name: testDb,
        autoload: true,
        timestamps: true,
      })

      const insertedDoc = await collection.insert({ hello: 'world' })

      assert.isBelow(
        insertedDoc.updatedAt.getTime() - beginning,
        reloadTimeUpperBound,
      )

      assert.isBelow(
        insertedDoc.createdAt.getTime() - beginning,
        reloadTimeUpperBound,
      )

      expect(Object.keys(insertedDoc)).toHaveLength(4)

      // Wait 100ms before performing the update
      await new Promise(resolve => setTimeout(resolve, 100))

      const step1 = Date.now()

      await collection.update(
        { _id: insertedDoc._id },
        { $set: { hello: 'mars' } },
        {},
      )

      const docs = await collection.find({ _id: insertedDoc._id })

      expect(docs).toHaveLength(1)
      expect(Object.keys(docs[0])).toHaveLength(4)
      expect(docs[0]._id).toEqual(insertedDoc._id)
      expect(docs[0].createdAt).toEqual(insertedDoc.createdAt)
      expect(docs[0].hello).toEqual('mars')
      assert.isAbove(docs[0].updatedAt.getTime() - beginning, 99) // updatedAt modified
      assert.isBelow(docs[0].updatedAt.getTime() - step1, reloadTimeUpperBound) // updatedAt modified
    })

    it('Can update multiple documents matching the query', async function () {
      // eslint-disable-next-line prefer-const
      let id1, id2, id3

      async function testPostUpdateState() {
        const docs = await collection.find({})

        const doc1 = find(docs, function (d) {
            return d._id === id1
          }),
          doc2 = find(docs, function (d) {
            return d._id === id2
          }),
          doc3 = find(docs, function (d) {
            return d._id === id3
          })

        expect(docs).toHaveLength(3)

        expect(Object.keys(doc1)).toHaveLength(2)
        expect(doc1.somedata).toEqual('ok')
        expect(doc1._id).toEqual(id1)

        expect(Object.keys(doc2)).toHaveLength(2)
        expect(doc2.newDoc).toEqual('yes')
        expect(doc2._id).toEqual(id2)

        expect(Object.keys(doc3)).toHaveLength(2)
        expect(doc3.newDoc).toEqual('yes')
        expect(doc3._id).toEqual(id3)
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

      const n = await collection.update(
        { somedata: 'again' },
        { newDoc: 'yes' },
        { multi: true },
      )

      expect(n.modifiedCount).toEqual(2)

      await testPostUpdateState()

      await collection.loadDatabase()

      await testPostUpdateState()
    })

    it('Can update only one document matching the query', async function () {
      // eslint-disable-next-line prefer-const
      let id1, id2, id3

      // Test DB state after update and reload
      async function testPostUpdateState() {
        const docs = await collection.find({})

        const doc1 = find(docs, d => d._id === id1),
          doc2 = find(docs, d => d._id === id2),
          doc3 = find(docs, d => d._id === id3)

        expect(docs).toHaveLength(3)

        assert.deepEqual(doc1, { somedata: 'ok', _id: doc1._id })
        assert.deepEqual(doc2, {
          somedata: 'again',
          plus: 'additional data',
          _id: doc2._id,
        })
        assert.deepEqual(doc3, { somedata: 'again', _id: doc3._id })
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

      expect(n.modifiedCount).toEqual(0)

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

        expect(nr.modifiedCount).toEqual(0)
        const docs = await collection.find({})
        expect(docs).toHaveLength(0)

        // test that upsert inserts
        const upsert = await collection.update(
          { impossible: 'db is empty anyway' },
          { something: 'created ok' },
          { upsert: true },
        )

        expect(upsert.acknowledged).toEqual(true)

        const newDoc = await collection.findOne({ something: 'created ok' })

        expect(newDoc.something).toEqual('created ok')

        assert.isDefined(newDoc._id)
        const docs2 = await collection.find({})
        expect(docs2).toHaveLength(1)
        expect(docs2[0].something).toEqual('created ok')

        // Modifying the returned upserted document doesn't modify the database
        newDoc.newField = true
        const docs3 = await collection.find({})
        assert.isUndefined(docs3[0].newField)
      })

      it('If the update query is a normal object with no modifiers, it is the doc that will be upserted', async function () {
        await collection.remove({}, { multi: true })
        await collection.update(
          { $or: [{ a: 4 }, { a: 5 }] },
          { hello: 'world', bloup: 'blap' },
          { upsert: true },
        )
        const docs = await collection.find({})
        expect(docs).toHaveLength(1)
        const doc = docs[0]
        expect(Object.keys(doc)).toHaveLength(3)
        expect(doc.hello).toEqual('world')
        expect(doc.bloup).toEqual('blap')
      })

      it('If the update query contains modifiers, it is applied to the object resulting from removing all operators from the find query 1', async function () {
        await collection.update(
          { $or: [{ a: 4 }, { a: 5 }] },
          { $set: { hello: 'world' }, $inc: { bloup: 3 } },
          { upsert: true },
        )

        const docs = await collection.find({ hello: 'world' })
        expect(docs).toHaveLength(1)
        const doc = docs[0]
        expect(Object.keys(doc)).toHaveLength(3)
        expect(doc.hello).toEqual('world')
        expect(doc.bloup).toEqual(3)
      })

      it('If the update query contains modifiers, it is applied to the object resulting from removing all operators from the find query 2', async function () {
        await collection.update(
          { $or: [{ a: 4 }, { a: 5 }], cac: 'rrr' },
          { $set: { hello: 'world' }, $inc: { bloup: 3 } },
          { upsert: true },
        )

        const docs = await collection.find({ hello: 'world' })
        expect(docs).toHaveLength(1)

        const doc = docs[0]
        expect(Object.keys(doc)).toHaveLength(4)
        expect(doc.cac).toEqual('rrr')
        expect(doc.hello).toEqual('world')
        expect(doc.bloup).toEqual(3)
      })

      it('Performing upsert with badly formatted fields yields a standard error not an exception', async function () {
        const err = await collection
          .update(
            { _id: '1234' },
            { $set: { $$badfield: 5 } },
            { upsert: true },
          )
          .catch(err => err)

        assert.isDefined(err)
      })
    })

    it('Cannot perform update if the update query is not either registered-modifiers-only or copy-only, or contain badly formatted fields', async function () {
      await collection.insert({ something: 'yup' })

      await expect(
        collection.update({}, { boom: { $badfield: 5 } }, { multi: false }),
      ).rejects.toThrow()

      await expect(
        collection.update({}, { boom: { 'bad.field': 5 } }, { multi: false }),
      ).rejects.toThrow()

      await expect(
        collection.update(
          {},
          { $inc: { test: 5 }, mixed: 'rrr' },
          { multi: false },
        ),
      ).rejects.toThrow()

      await expect(
        collection.update({}, { $inexistent: { test: 5 } }, { multi: false }),
      ).rejects.toThrow()
    })

    it('Can update documents using multiple modifiers', async function () {
      const newDoc = await collection.insert({ something: 'yup', other: 40 })
      const id = newDoc._id

      const nr = await collection.update(
        {},
        { $set: { something: 'changed' }, $inc: { other: 10 } },
        { multi: false },
      )

      assert.equal(nr.modifiedCount, 1)

      const doc = await collection.findOne({ _id: id })
      assert.lengthOf(Object.keys(doc), 3)
      assert.equal(doc._id, id)
      assert.equal(doc.something, 'changed')
      assert.equal(doc.other, 50)
    })

    it('Can upsert a document even with modifiers', async function () {
      const update = await collection.update(
        { bloup: 'blap' },
        { $set: { hello: 'world' } },
        { upsert: true },
      )

      expect(update.acknowledged).toEqual(true)
      expect(update.insertedIds).toEqual(expect.any(Array))

      const [_id] = update.insertedIds

      const newDoc = await collection.findOne({ _id })

      expect(newDoc.bloup).toEqual('blap')
      expect(newDoc.hello).toEqual('world')
      assert.isDefined(newDoc._id)

      const docs = await collection.find({})

      expect(docs).toHaveLength(1)
      expect(Object.keys(docs[0])).toHaveLength(3)
      expect(docs[0].hello).toEqual('world')
      expect(docs[0].bloup).toEqual('blap')
      assert.isDefined(docs[0]._id)
    })

    it('When using modifiers, the only way to update subdocs is with the dot-notation', async function () {
      await collection.insert({ bloup: { blip: 'blap', other: true } })

      // Correct method
      await collection.update({}, { $set: { 'bloup.blip': 'hello' } }, {})
      let doc = await collection.findOne({})
      expect(doc.bloup.blip).toEqual('hello')
      expect(doc.bloup.other).toEqual(true)

      // Wrong
      await collection.update({}, { $set: { bloup: { blip: 'ola' } } }, {})
      doc = await collection.findOne({})
      expect(doc.bloup.blip).toEqual('ola')
      assert.isUndefined(doc.bloup.other) // This information was lost
    })

    it('Returns an error if the query is not well formed', async function () {
      await collection.remove({}, { multi: true })
      await collection.insert({ hello: 'world' })

      await expect(
        collection.update({ $or: { hello: 'world' } }, { a: 1 }, {}),
      ).rejects.toThrow()
    })

    it('If an error is thrown by a modifier, the database state is not changed', async function () {
      const newDoc = await collection.insert({ hello: 'world' })
      let docs = await collection.find({})
      assert.deepEqual(docs, [{ _id: newDoc._id, hello: 'world' }])

      await expect(
        collection.update({}, { $inc: { hello: 4 } }, {}),
      ).rejects.toThrow()

      // Check that the database state is unchanged
      docs = await collection.find({})
      assert.deepEqual(docs, [{ _id: newDoc._id, hello: 'world' }])
    })

    it('Cant change the _id of a document', async function () {
      const newDoc = await collection.insert({ a: 2 })
      await expect(
        collection.update({ a: 2 }, { a: 2, _id: 'nope' }, {}),
      ).rejects.toThrow()

      let docs = await collection.find({})
      expect(docs).toHaveLength(1)
      expect(Object.keys(docs[0])).toHaveLength(2)
      expect(docs[0].a).toEqual(2)
      expect(docs[0]._id).toEqual(newDoc._id)

      await expect(
        collection.update({ a: 2 }, { $set: { _id: 'nope' } }, {}),
      ).rejects.toThrow()

      docs = await collection.find({})
      expect(docs).toHaveLength(1)
      expect(Object.keys(docs[0])).toHaveLength(2)
      expect(docs[0].a).toEqual(2)
      expect(docs[0]._id).toEqual(newDoc._id)
    })

    it('Non-multi updates are persistent', async function () {
      const doc1 = await collection.insert({ a: 1, hello: 'world' })
      const doc2 = await collection.insert({ a: 2, hello: 'earth' })

      await collection.update({ a: 2 }, { $set: { hello: 'changed' } }, {})

      let docs = await collection.find({})

      docs.sort(function (a, b) {
        return a.a - b.a
      })

      expect(docs).toHaveLength(2)
      expect(
        isEqual(docs[0], {
          _id: doc1._id,
          a: 1,
          hello: 'world',
        }),
      ).toEqual(true)
      expect(
        isEqual(docs[1], {
          _id: doc2._id,
          a: 2,
          hello: 'changed',
        }),
      ).toEqual(true)

      await collection.loadDatabase()

      docs = await collection.find({})

      docs.sort(function (a, b) {
        return a.a - b.a
      })

      expect(docs).toHaveLength(2)
      expect(
        isEqual(docs[0], {
          _id: doc1._id,
          a: 1,
          hello: 'world',
        }),
      ).toEqual(true)
      expect(
        isEqual(docs[1], {
          _id: doc2._id,
          a: 2,
          hello: 'changed',
        }),
      ).toEqual(true)
    })

    it('Multi updates are persistent', async function () {
      const doc1 = await collection.insert({ a: 1, hello: 'world' })
      const doc2 = await collection.insert({ a: 2, hello: 'earth' })
      const doc3 = await collection.insert({ a: 5, hello: 'pluton' })

      await collection.update(
        { a: { $in: [1, 2] } },
        { $set: { hello: 'changed' } },
        { multi: true },
      )

      const docs = await collection.find({}).sort({ a: 1 })

      expect(docs).toHaveLength(3)
      expect(
        isEqual(docs[0], {
          _id: doc1._id,
          a: 1,
          hello: 'changed',
        }),
      ).toEqual(true)
      expect(
        isEqual(docs[1], {
          _id: doc2._id,
          a: 2,
          hello: 'changed',
        }),
      ).toEqual(true)
      expect(
        isEqual(docs[2], {
          _id: doc3._id,
          a: 5,
          hello: 'pluton',
        }),
      ).toEqual(true)

      // Even after a reload the database state hasn't changed
      await collection.loadDatabase()

      const reloadedDocs = await collection.find({}).sort({ a: 1 })

      expect(reloadedDocs).toHaveLength(3)
      expect(
        isEqual(reloadedDocs[0], {
          _id: doc1._id,
          a: 1,
          hello: 'changed',
        }),
      ).toEqual(true)
      expect(
        isEqual(reloadedDocs[1], {
          _id: doc2._id,
          a: 2,
          hello: 'changed',
        }),
      ).toEqual(true)
      expect(
        isEqual(reloadedDocs[2], {
          _id: doc3._id,
          a: 5,
          hello: 'pluton',
        }),
      ).toEqual(true)
    })

    it('Can update without the options arg (will use defaults then)', async () => {
      const doc1 = await collection.insert({ a: 1, hello: 'world' })
      const doc2 = await collection.insert({ a: 2, hello: 'earth' })
      const doc3 = await collection.insert({ a: 5, hello: 'pluton' })

      const nr = await collection.update({ a: 2 }, { $inc: { a: 10 } })

      assert.strictEqual(nr.modifiedCount, 1)

      const docs = await collection.find({})

      const d1 = find(docs, doc => doc._id === doc1._id)

      const d2 = find(docs, doc => doc._id === doc2._id)

      const d3 = find(docs, doc => doc._id === doc3._id)

      assert.strictEqual(d1.a, 1)
      assert.strictEqual(d2.a, 12)
      assert.strictEqual(d3.a, 5)
    })

    it('If a multi update fails on one document, previous updates should be rolled back', async function () {
      await collection.ensureIndex({ fieldName: 'a' })

      const doc1 = await collection.insert({ a: 4 })
      const doc2 = await collection.insert({ a: 5 })
      const doc3 = await collection.insert({ a: 'abc' })

      await expect(
        collection.update(
          { a: { $in: [4, 5, 'abc'] } },
          { $inc: { a: 10 } },
          { multi: true },
        ),
      ).rejects.toThrow()

      // No index modified
      each(collection.indexes, function (index) {
        const docs = index.getAll(),
          d1 = find(docs, function (doc) {
            return doc._id === doc1._id
          }),
          d2 = find(docs, function (doc) {
            return doc._id === doc2._id
          }),
          d3 = find(docs, function (doc) {
            return doc._id === doc3._id
          })
        // All changes rolled back, including those that didn't trigger an error
        expect(d1.a).toEqual(4)
        expect(d2.a).toEqual(5)
        expect(d3.a).toEqual('abc')
      })
    })

    it('If an index constraint is violated by an update, all changes should be rolled back', async function () {
      await collection.ensureIndex({ fieldName: 'a', unique: true })
      const doc1 = await collection.insert({ a: 4 })
      const doc2 = await collection.insert({ a: 5 })

      // With this query, candidates are always returned in the order 4, 5, 'abc' so it's always the last one which fails
      await expect(
        collection.update(
          { a: { $in: [4, 5, 'abc'] } },
          { $set: { a: 10 } },
          { multi: true },
        ),
      ).rejects.toThrow()

      // Check that no index was modified
      each(collection.indexes, function (index) {
        const docs = index.getAll(),
          d1 = find(docs, function (doc) {
            return doc._id === doc1._id
          }),
          d2 = find(docs, function (doc) {
            return doc._id === doc2._id
          })
        expect(d1.a).toEqual(4)
        expect(d2.a).toEqual(5)
      })
    })

    it('createdAt property is unchanged and updatedAt correct after an update, even a complete document replacement', async () => {
      const d2 = new Collection({ timestamps: true })
      await d2.insert({ a: 1 })
      const doc = await d2.findOne({ a: 1 })
      const createdAt = doc.createdAt.getTime()

      // Modifying update
      await new Promise(resolve => setTimeout(resolve, 20))
      await d2.update({ a: 1 }, { $set: { b: 2 } }, {})
      const modifiedDoc = await d2.findOne({ a: 1 })
      assert.strictEqual(modifiedDoc.createdAt.getTime(), createdAt)
      assert.isBelow(Date.now() - modifiedDoc.updatedAt.getTime(), 5)

      // Complete replacement
      await new Promise(resolve => setTimeout(resolve, 20))
      await d2.update({ a: 1 }, { c: 3 }, {})
      const replacedDoc = await d2.findOne({ c: 3 })
      assert.strictEqual(replacedDoc.createdAt.getTime(), createdAt)
      assert.isBelow(Date.now() - replacedDoc.updatedAt.getTime(), 5)
    })

    describe('Promise signature', function () {
      it('Regular update, multi false', async function () {
        await collection.insert({ a: 1 })
        await collection.insert({ a: 2 })

        const result1 = await collection.update(
          { a: 1 },
          { $set: { b: 20 } },
          {},
        )
        expect(result1.modifiedCount).toEqual(1)
        assert.isUndefined(result1.updatedDocs)

        const result2 = await collection.update(
          { a: 1 },
          { $set: { b: 21 } },
          { returnUpdatedDocs: true },
        )
        expect(result2.modifiedCount).toEqual(1)
        expect(result2.updatedDocs).toHaveLength(1)
        assert.isUndefined(result2.insertedIds)

        const [updatedDoc] = result2.updatedDocs

        expect(updatedDoc.b).toEqual(21)
      })

      it('Regular update, multi true', async function () {
        await collection.insert({ a: 1 })
        await collection.insert({ a: 2 })

        const result1 = await collection.update(
          {},
          { $set: { b: 20 } },
          { multi: true },
        )

        assert.equal(result1.modifiedCount, 2)
        assert.isUndefined(result1.updatedDocs)

        const result2 = await collection.update(
          {},
          { $set: { b: 21 } },
          { multi: true, returnUpdatedDocs: true },
        )

        assert.equal(result2.modifiedCount, 2)
        assert.exists(result2.updatedDocs)
        assert.lengthOf(result2.updatedDocs, 2)
      })

      it('Upsert', async function () {
        await collection.remove({}, { multi: true })
        await collection.insert({ a: 1 })
        await collection.insert({ a: 2 })

        // Upsert flag not set
        let upsertResult = await collection.update(
          { a: 3 },
          { $set: { b: 20 } },
        )
        assert.strictEqual(upsertResult.modifiedCount, 0)
        assert.isUndefined(upsertResult.updatedDocs)
        assert.isUndefined(upsertResult.upsert)

        // Upsert flag set
        upsertResult = await collection.update(
          { a: 3 },
          { $set: { b: 21 } },
          { upsert: true },
        )

        assert.strictEqual(upsertResult.insertedDocs[0].a, 3)
        assert.strictEqual(upsertResult.insertedDocs[0].b, 21)
        assert.strictEqual(upsertResult.upsert, true)

        const docs = await collection.find({})
        assert.strictEqual(docs.length, 3)
      })
    })
  })

  describe('Remove', function () {
    it('Can remove multiple documents', async function () {
      const id1 = (await collection.insert({ somedata: 'ok' }))._id

      // Test DB status
      const testPostUpdateState = async () => {
        const docs = await collection.find({})

        expect(docs).toHaveLength(1)

        expect(Object.keys(docs[0])).toHaveLength(2)

        expect(docs[0]._id).toEqual(id1)

        expect(docs[0].somedata).toEqual('ok')
      }

      await collection.insert({
        somedata: 'again',
        plus: 'additional data',
      })

      await collection.insert({ somedata: 'again' })

      // Test with query that doesn't match anything
      const n = await collection.remove({ somedata: 'again' }, { multi: true })

      expect(n).toEqual(2)

      await testPostUpdateState()

      await collection.loadDatabase()

      await testPostUpdateState()
    })

    // This tests concurrency issues
    it('Remove can be called multiple times in parallel and everything that needs to be removed will be', async function () {
      await collection.insert({ planet: 'Earth' })
      await collection.insert({ planet: 'Mars' })
      await collection.insert({ planet: 'Saturn' })

      const docs = await collection.find({})
      assert.equal(docs.length, 3)

      const toRemove = ['Mars', 'Saturn']
      await Promise.all(toRemove.map(planet => collection.remove({ planet })))

      const newDocs = await collection.find({})
      assert.equal(newDocs.length, 1)
    })

    it('Returns an error if the query is not well formed', async function () {
      await collection.insert({ hello: 'world' })
      await expect(
        collection.remove({ $or: { hello: 'world' } }, {}),
      ).rejects.toThrow()
    })

    it('Non-multi removes are persistent', async function () {
      const doc1 = await collection.insert({ a: 1, hello: 'world' })
      await collection.insert({ a: 2, hello: 'earth' })
      const doc3 = await collection.insert({ a: 3, hello: 'moto' })

      await collection.remove({ a: 2 }, {})

      const docs = await collection.find({})
      docs.sort((a, b) => a.a - b.a)
      expect(docs).toHaveLength(2)

      expect(
        isEqual(docs[0], {
          _id: doc1._id,
          a: 1,
          hello: 'world',
        }),
      ).toEqual(true)
      expect(
        isEqual(docs[1], {
          _id: doc3._id,
          a: 3,
          hello: 'moto',
        }),
      ).toEqual(true)

      // Even after a reload the database state hasn't changed
      await collection.loadDatabase()

      const reloadedDocs = await collection.find({})
      reloadedDocs.sort((a, b) => a.a - b.a)
      expect(reloadedDocs).toHaveLength(2)

      expect(
        isEqual(reloadedDocs[0], {
          _id: doc1._id,
          a: 1,
          hello: 'world',
        }),
      ).toEqual(true)
      expect(
        isEqual(reloadedDocs[1], {
          _id: doc3._id,
          a: 3,
          hello: 'moto',
        }),
      ).toEqual(true)
    })

    it('Multi removes are persistent', async function () {
      await collection.insert({ a: 1, hello: 'world' })

      const doc2 = await collection.insert({ a: 2, hello: 'earth' })

      await collection.insert({ a: 3, hello: 'moto' })

      await collection.remove({ a: { $in: [1, 3] } }, { multi: true })

      const docs = await collection.find({})
      assert.strictEqual(docs.length, 1)
      assert.deepStrictEqual(docs[0], { _id: doc2._id, a: 2, hello: 'earth' })

      await collection.loadDatabase()
      const reloadedDocs = await collection.find({})
      assert.strictEqual(reloadedDocs.length, 1)
      assert.deepStrictEqual(reloadedDocs[0], {
        _id: doc2._id,
        a: 2,
        hello: 'earth',
      })
    })

    it('Can remove without the options arg (will use defaults then)', async function () {
      const doc1 = await collection.insert({ a: 1, hello: 'world' })
      const doc2 = await collection.insert({ a: 2, hello: 'earth' })
      const doc3 = await collection.insert({ a: 5, hello: 'pluton' })

      const nr = await collection.remove({ a: 2 })
      assert.equal(nr, 1)

      const docs = await collection.find({})
      const d1 = find(docs, doc => doc._id === doc1._id)
      const d2 = find(docs, doc => doc._id === doc2._id)
      const d3 = find(docs, doc => doc._id === doc3._id)

      assert.equal(d1.a, 1)
      assert.isUndefined(d2)
      assert.equal(d3.a, 5)
    })
  })

  describe('Using indexes', function () {
    describe('ensureIndex and index initialization in database loading', function () {
      it('ensureIndex can be called right after a loadDatabase and be initialized and filled correctly', async function () {
        const now = new Date()

        const rawData =
          serialize({ _id: 'aaa', z: '1', a: 2, ages: [1, 5, 12] }) +
          '\n' +
          serialize({ _id: 'bbb', z: '2', hello: 'world' }) +
          '\n' +
          serialize({ _id: 'ccc', z: '3', nested: { today: now } })

        expect(collection.getAllData()).toHaveLength(0)

        await fs.promises.writeFile(testDb, rawData, 'utf8')
        await collection.loadDatabase()

        expect(collection.getAllData()).toHaveLength(3)

        assert.deepEqual(Object.keys(collection.indexes), ['_id'])

        await collection.ensureIndex({ fieldName: 'z' })

        assert.deepEqual(collection.indexes.z.fieldName, 'z')
        assert.deepEqual(collection.indexes.z.unique, false)
        assert.deepEqual(collection.indexes.z.sparse, false)
        assert.deepEqual(collection.indexes.z.tree.getNumberOfKeys(), 3)
        assert.deepEqual(
          collection.indexes.z.tree.search('1')[0],
          collection.getAllData()[0],
        )
        assert.deepEqual(
          collection.indexes.z.tree.search('2')[0],
          collection.getAllData()[1],
        )
        assert.deepEqual(
          collection.indexes.z.tree.search('3')[0],
          collection.getAllData()[2],
        )
      })

      it('ensureIndex can be called twice on the same field, the second call will have no effect', async function () {
        assert.strictEqual(Object.keys(collection.indexes).length, 1)
        assert.strictEqual(Object.keys(collection.indexes)[0], '_id')

        await collection.insert({ planet: 'Earth' })
        await collection.insert({ planet: 'Mars' })

        const docs = await collection.find({})
        assert.strictEqual(docs.length, 2)

        await collection.ensureIndex({ fieldName: 'planet' })

        assert.strictEqual(Object.keys(collection.indexes).length, 2)
        assert.strictEqual(Object.keys(collection.indexes)[0], '_id')
        assert.strictEqual(Object.keys(collection.indexes)[1], 'planet')

        assert.strictEqual(collection.indexes.planet.getAll().length, 2)

        // This second call has no effect, documents don't get inserted twice in the index
        await collection.ensureIndex({ fieldName: 'planet' })

        assert.strictEqual(Object.keys(collection.indexes).length, 2)
        assert.strictEqual(Object.keys(collection.indexes)[0], '_id')
        assert.strictEqual(Object.keys(collection.indexes)[1], 'planet')

        assert.strictEqual(collection.indexes.planet.getAll().length, 2)
      })

      it('ensureIndex can be called after the data set was modified and the index still be correct', async function () {
        const rawData =
          serialize({ _id: 'aaa', z: '1', a: 2, ages: [1, 5, 12] }) +
          '\n' +
          serialize({ _id: 'bbb', z: '2', hello: 'world' })

        expect(collection.getAllData()).toHaveLength(0)
        await fs.promises.writeFile(testDb, rawData, 'utf8')
        await collection.loadDatabase()
        expect(collection.getAllData()).toHaveLength(2)

        assert.deepEqual(Object.keys(collection.indexes), ['_id'])

        const newDoc1 = await collection.insert({ z: '12', yes: 'yes' })
        const newDoc2 = await collection.insert({ z: '14', nope: 'nope' })
        await collection.remove({ z: '2' }, {})
        await collection.update({ z: '1' }, { $set: { yes: 'yep' } }, {})

        assert.deepEqual(Object.keys(collection.indexes), ['_id'])

        await collection.ensureIndex({ fieldName: 'z' })
        expect(collection.indexes.z.fieldName).toEqual('z')
        expect(collection.indexes.z.unique).toEqual(false)
        expect(collection.indexes.z.sparse).toEqual(false)
        expect(collection.indexes.z.tree.getNumberOfKeys()).toEqual(3)

        // The pointers in the _id and z indexes are the same
        expect(collection.indexes.z.tree.search('1')[0]).toEqual(
          collection.indexes._id.getMatching('aaa')[0],
        )
        expect(collection.indexes.z.tree.search('12')[0]).toEqual(
          collection.indexes._id.getMatching(newDoc1._id)[0],
        )
        expect(collection.indexes.z.tree.search('14')[0]).toEqual(
          collection.indexes._id.getMatching(newDoc2._id)[0],
        )

        // The data in the z index is correct
        const docs = await collection.find({})
        const doc0 = find(docs, function (doc) {
          return doc._id === 'aaa'
        })
        const doc1 = find(docs, function (doc) {
          return doc._id === newDoc1._id
        })
        const doc2 = find(docs, function (doc) {
          return doc._id === newDoc2._id
        })

        expect(docs).toHaveLength(3)
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
      })

      it('ensureIndex can be called before a loadDatabase and still be initialized and filled correctly', async () => {
        const now = new Date(),
          rawData =
            serialize({ _id: 'aaa', z: '1', a: 2, ages: [1, 5, 12] }) +
            '\n' +
            serialize({ _id: 'bbb', z: '2', hello: 'world' }) +
            '\n' +
            serialize({ _id: 'ccc', z: '3', nested: { today: now } })

        expect(collection.getAllData()).toHaveLength(0)

        await collection.ensureIndex({ fieldName: 'z' })

        assert.equal(collection.indexes.z.fieldName, 'z')
        assert.equal(collection.indexes.z.unique, false)
        assert.equal(collection.indexes.z.sparse, false)
        assert.equal(collection.indexes.z.tree.getNumberOfKeys(), 0)

        await fs.promises.writeFile(testDb, rawData, 'utf8')
        await collection.loadDatabase()

        const doc1 = find(collection.getAllData(), doc => doc.z === '1'),
          doc2 = find(collection.getAllData(), doc => doc.z === '2'),
          doc3 = find(collection.getAllData(), doc => doc.z === '3')

        assert.equal(collection.getAllData().length, 3)
        assert.equal(collection.indexes.z.tree.getNumberOfKeys(), 3)
        assert.equal(collection.indexes.z.tree.search('1')[0], doc1)
        assert.equal(collection.indexes.z.tree.search('2')[0], doc2)
        assert.equal(collection.indexes.z.tree.search('3')[0], doc3)
      })

      it('Can initialize multiple indexes on a database load', async function () {
        const now = new Date()
        const rawData =
          serialize({ _id: 'aaa', z: '1', a: 2, ages: [1, 5, 12] }) +
          '\n' +
          serialize({ _id: 'bbb', z: '2', a: 'world' }) +
          '\n' +
          serialize({ _id: 'ccc', z: '3', a: { today: now } })
        assert.lengthOf(collection.getAllData(), 0)

        await collection.ensureIndex({ fieldName: 'z' })
        await collection.ensureIndex({ fieldName: 'a' })
        assert.equal(collection.indexes.a.tree.getNumberOfKeys(), 0)
        assert.equal(collection.indexes.z.tree.getNumberOfKeys(), 0)

        await fs.promises.writeFile(testDb, rawData, 'utf8')
        await collection.loadDatabase()

        const doc1 = find(collection.getAllData(), doc => doc.z === '1')
        const doc2 = find(collection.getAllData(), doc => doc.z === '2')
        const doc3 = find(collection.getAllData(), doc => doc.z === '3')

        assert.equal(collection.getAllData().length, 3)
        assert.equal(collection.indexes.z.tree.getNumberOfKeys(), 3)
        assert.equal(collection.indexes.z.tree.search('1')[0], doc1)
        assert.equal(collection.indexes.z.tree.search('2')[0], doc2)
        assert.equal(collection.indexes.z.tree.search('3')[0], doc3)

        assert.equal(collection.indexes.a.tree.getNumberOfKeys(), 3)
        assert.equal(collection.indexes.a.tree.search(2)[0], doc1)
        assert.equal(collection.indexes.a.tree.search('world')[0], doc2)
        assert.equal(collection.indexes.a.tree.search({ today: now })[0], doc3)
      })

      it('If a unique constraint is not respected, database loading will not work and no data will be inserted', async function () {
        const now = new Date(),
          rawData =
            serialize({ _id: 'aaa', z: '1', a: 2, ages: [1, 5, 12] }) +
            '\n' +
            serialize({ _id: 'bbb', z: '2', a: 'world' }) +
            '\n' +
            serialize({ _id: 'ccc', z: '1', a: { today: now } })
        expect(collection.getAllData()).toHaveLength(0)

        await collection.ensureIndex({ fieldName: 'z', unique: true })
        expect(collection.indexes.z.tree.getNumberOfKeys()).toEqual(0)

        await fs.promises.writeFile(testDb, rawData, 'utf8')
        await expect(collection.loadDatabase()).rejects.toThrow(
          'Unique Constraint Violation',
        )
        expect(collection.getAllData()).toHaveLength(0)
        expect(collection.indexes.z.tree.getNumberOfKeys()).toEqual(0)
      })

      it('If a unique constraint is not respected, ensureIndex will return an error and not create an index', async function () {
        await collection.insert({ a: 1, b: 4 })
        await collection.insert({ a: 2, b: 45 })
        await collection.insert({ a: 1, b: 3 })

        await collection.ensureIndex({ fieldName: 'b' })

        await expect(
          collection.ensureIndex({ fieldName: 'a', unique: true }),
        ).rejects.toThrow('Unique Constraint Violation')

        assert.deepEqual(Object.keys(collection.indexes), ['_id', 'b'])
      })

      it('Can remove an index', async function () {
        await collection.ensureIndex({ fieldName: 'e' })
        assert.isNotNull(collection.indexes.e)
        assert.lengthOf(Object.keys(collection.indexes), 2)

        await collection.removeIndex('e')
        assert.isUndefined(collection.indexes.e)
        assert.lengthOf(Object.keys(collection.indexes), 1)
      })
    })

    describe('Indexing newly inserted documents', function () {
      it('Newly inserted documents are indexed', async () => {
        await collection.ensureIndex({ fieldName: 'z' })
        assert.equal(collection.indexes.z.tree.getNumberOfKeys(), 0)

        const newDoc1 = await collection.insert({ a: 2, z: 'yes' })
        assert.equal(collection.indexes.z.tree.getNumberOfKeys(), 1)
        assert.deepEqual(collection.indexes.z.getMatching('yes'), [newDoc1])

        const newDoc2 = await collection.insert({ a: 5, z: 'nope' })
        assert.equal(collection.indexes.z.tree.getNumberOfKeys(), 2)
        assert.deepEqual(collection.indexes.z.getMatching('nope'), [newDoc2])
      })

      it('If multiple indexes are defined, the document is inserted in all of them', async function () {
        await collection.ensureIndex({ fieldName: 'z' })
        await collection.ensureIndex({ fieldName: 'ya' })
        assert.equal(collection.indexes.z.tree.getNumberOfKeys(), 0)

        const newDoc = await collection.insert({ a: 2, z: 'yes', ya: 'indeed' })
        assert.equal(collection.indexes.z.tree.getNumberOfKeys(), 1)
        assert.equal(collection.indexes.ya.tree.getNumberOfKeys(), 1)
        assert.deepEqual(collection.indexes.z.getMatching('yes'), [newDoc])
        assert.deepEqual(collection.indexes.ya.getMatching('indeed'), [newDoc])

        const newDoc2 = await collection.insert({ a: 5, z: 'nope', ya: 'sure' })
        assert.equal(collection.indexes.z.tree.getNumberOfKeys(), 2)
        assert.equal(collection.indexes.ya.tree.getNumberOfKeys(), 2)
        assert.deepEqual(collection.indexes.z.getMatching('nope'), [newDoc2])
        assert.deepEqual(collection.indexes.ya.getMatching('sure'), [newDoc2])
      })

      it('Can insert two docs at the same key for a non unique index', async function () {
        await collection.ensureIndex({ fieldName: 'z' })
        assert.strictEqual(collection.indexes.z.tree.getNumberOfKeys(), 0)

        const newDoc = await collection.insert({ a: 2, z: 'yes' })
        assert.strictEqual(collection.indexes.z.tree.getNumberOfKeys(), 1)
        assert.deepEqual(collection.indexes.z.getMatching('yes'), [newDoc])

        const newDoc2 = await collection.insert({ a: 5, z: 'yes' })
        assert.strictEqual(collection.indexes.z.tree.getNumberOfKeys(), 1)
        assert.deepEqual(collection.indexes.z.getMatching('yes'), [
          newDoc,
          newDoc2,
        ])
      })

      it('If the index has a unique constraint, an error is thrown if it is violated and the data is not modified', async () => {
        await collection.ensureIndex({ fieldName: 'z', unique: true })
        assert.strictEqual(collection.indexes.z.tree.getNumberOfKeys(), 0)

        const newDoc = await collection.insert({ a: 2, z: 'yes' })
        assert.strictEqual(collection.indexes.z.tree.getNumberOfKeys(), 1)
        assert.deepEqual(collection.indexes.z.getMatching('yes'), [newDoc])

        await expect(collection.insert({ a: 5, z: 'yes' })).rejects.toThrow()

        // Index didn't change
        assert.strictEqual(collection.indexes.z.tree.getNumberOfKeys(), 1)
        assert.deepEqual(collection.indexes.z.getMatching('yes'), [newDoc])

        // Data didn't change
        assert.deepEqual(collection.getAllData(), [newDoc])

        await collection.loadDatabase()
        assert.strictEqual(collection.getAllData().length, 1)
        assert.deepEqual(collection.getAllData()[0], newDoc)
      })

      it('If an index has a unique constraint, other indexes cannot be modified when it raises an error', async function () {
        await collection.ensureIndex({ fieldName: 'nonu1' })
        await collection.ensureIndex({ fieldName: 'uni', unique: true })
        await collection.ensureIndex({ fieldName: 'nonu2' })

        const newDoc = await collection.insert({
          nonu1: 'yes',
          nonu2: 'yes2',
          uni: 'willfail',
        })

        assert.strictEqual(collection.indexes.nonu1.tree.getNumberOfKeys(), 1)
        assert.strictEqual(collection.indexes.uni.tree.getNumberOfKeys(), 1)
        assert.strictEqual(collection.indexes.nonu2.tree.getNumberOfKeys(), 1)

        await expect(
          collection.insert({
            nonu1: 'no',
            nonu2: 'no2',
            uni: 'willfail',
          }),
        ).rejects.toThrow()

        assert.strictEqual(collection.indexes.nonu1.tree.getNumberOfKeys(), 1)
        assert.strictEqual(collection.indexes.uni.tree.getNumberOfKeys(), 1)
        assert.strictEqual(collection.indexes.nonu2.tree.getNumberOfKeys(), 1)

        assert.deepEqual(collection.indexes.nonu1.getMatching('yes'), [newDoc])
        assert.deepEqual(collection.indexes.uni.getMatching('willfail'), [
          newDoc,
        ])
        assert.deepEqual(collection.indexes.nonu2.getMatching('yes2'), [newDoc])
      })

      it('Unique indexes prevent you from inserting two docs where the field is undefined except if theyre sparse', async function () {
        await collection.ensureIndex({ fieldName: 'zzz', unique: true })
        assert.strictEqual(collection.indexes.zzz.tree.getNumberOfKeys(), 0)

        const newDoc = await collection.insert({ a: 2, z: 'yes' })
        assert.strictEqual(collection.indexes.zzz.tree.getNumberOfKeys(), 1)
        assert.deepStrictEqual(collection.indexes.zzz.getMatching(undefined), [
          newDoc,
        ])

        await expect(collection.insert({ a: 5, z: 'other' })).rejects.toThrow()

        await collection.ensureIndex({
          fieldName: 'yyy',
          unique: true,
          sparse: true,
        })

        await collection.insert({ a: 5, z: 'other', zzz: 'set' })
        assert.strictEqual(collection.indexes.yyy.getAll().length, 0)
        assert.strictEqual(collection.indexes.zzz.getAll().length, 2)
      })

      it('Insertion still works as before with indexing', async function () {
        await collection.ensureIndex({ fieldName: 'a' })
        await collection.ensureIndex({ fieldName: 'b' })

        const doc1 = await collection.insert({ a: 1, b: 'hello' })
        const doc2 = await collection.insert({ a: 2, b: 'si' })

        const docs = await collection.find({})

        assert.deepEqual(
          doc1,
          find(docs, d => {
            return d._id === doc1._id
          }),
        )
        assert.deepEqual(
          doc2,
          find(docs, d => {
            return d._id === doc2._id
          }),
        )
      })

      it('All indexes point to the same data as the main index on _id', async function () {
        await collection.ensureIndex({ fieldName: 'a' })

        const doc1 = await collection.insert({ a: 1, b: 'hello' })
        const doc2 = await collection.insert({ a: 2, b: 'si' })

        const docs = await collection.find({})
        assert.equal(docs.length, 2)
        assert.equal(collection.getAllData().length, 2)

        assert.equal(collection.indexes._id.getMatching(doc1._id).length, 1)
        assert.equal(collection.indexes.a.getMatching(1).length, 1)
        assert.equal(
          collection.indexes._id.getMatching(doc1._id)[0],
          collection.indexes.a.getMatching(1)[0],
        )

        assert.equal(collection.indexes._id.getMatching(doc2._id).length, 1)
        assert.equal(collection.indexes.a.getMatching(2).length, 1)
        assert.equal(
          collection.indexes._id.getMatching(doc2._id)[0],
          collection.indexes.a.getMatching(2)[0],
        )
      })

      it('If a unique constraint is violated, no index is changed, including the main one', async function () {
        await collection.ensureIndex({ fieldName: 'a', unique: true })

        const doc1 = await collection.insert({ a: 1, b: 'hello' })
        await expect(collection.insert({ a: 1, b: 'si' })).rejects.toThrow()

        const docs = await collection.find({})
        expect(docs).toHaveLength(1)
        expect(collection.getAllData()).toHaveLength(1)

        expect(collection.indexes._id.getMatching(doc1._id)).toHaveLength(1)
        expect(collection.indexes.a.getMatching(1)).toHaveLength(1)
        expect(collection.indexes._id.getMatching(doc1._id)[0]).toEqual(
          collection.indexes.a.getMatching(1)[0],
        )

        expect(collection.indexes.a.getMatching(2)).toHaveLength(0)
      })
    })

    describe('Updating indexes upon document update', function () {
      it('Updating docs still works as before with indexing', async function () {
        await collection.ensureIndex({ fieldName: 'a' })
        const _doc1 = await collection.insert({ a: 1, b: 'hello' })
        const _doc2 = await collection.insert({ a: 2, b: 'si' })

        const nr = await collection.update(
          { a: 1 },
          { $set: { a: 456, b: 'no' } },
          {},
        )
        const data = collection.getAllData()
        const doc1 = find(data, doc => doc._id === _doc1._id)
        const doc2 = find(data, doc => doc._id === _doc2._id)

        assert.equal(nr.modifiedCount, 1)
        assert.equal(data.length, 2)
        assert.deepEqual(doc1, { a: 456, b: 'no', _id: _doc1._id })
        assert.deepEqual(doc2, { a: 2, b: 'si', _id: _doc2._id })

        const nr2 = await collection.update(
          {},
          { $inc: { a: 10 }, $set: { b: 'same' } },
          { multi: true },
        )
        const data2 = collection.getAllData()
        const doc3 = find(data2, doc => doc._id === _doc1._id)
        const doc4 = find(data2, doc => doc._id === _doc2._id)

        assert.equal(nr2.modifiedCount, 2)
        assert.equal(data2.length, 2)
        assert.deepEqual(doc3, { a: 466, b: 'same', _id: _doc1._id })
        assert.deepEqual(doc4, { a: 12, b: 'same', _id: _doc2._id })
      })

      it('Indexes get updated when a document (or multiple documents) is updated', async function () {
        await collection.ensureIndex({ fieldName: 'a' })
        await collection.ensureIndex({ fieldName: 'b' })

        const doc1 = await collection.insert({ a: 1, b: 'hello' })
        const doc2 = await collection.insert({ a: 2, b: 'si' })

        // Simple update
        await collection.update({ a: 1 }, { $set: { a: 456, b: 'no' } }, {})

        let nr = await collection.count({ a: 456 })
        assert.equal(nr, 1)

        nr = await collection.count({ a: 2 })
        assert.equal(nr, 1)

        let matchingDocs = await collection.find({ a: 456 })
        let matchingDoc = matchingDocs[0]
        assert.equal(matchingDoc._id, doc1._id)

        matchingDocs = await collection.find({ a: 2 })
        matchingDoc = matchingDocs[0]
        assert.equal(matchingDoc._id, doc2._id)

        // Multi update
        await collection.update(
          {},
          { $inc: { a: 10 }, $set: { b: 'same' } },
          { multi: true },
        )

        nr = await collection.count({ a: 466 })
        assert.equal(nr, 1)

        nr = await collection.count({ a: 12 })
        assert.equal(nr, 1)

        matchingDocs = await collection.find({ b: 'same' })
        assert.equal(matchingDocs.length, 2)
        assert(matchingDocs.some(doc => doc._id === doc1._id))
        assert(matchingDocs.some(doc => doc._id === doc2._id))
      })

      it('If a simple update violates a contraint, all changes are rolled back and an error is thrown', async () => {
        await collection.ensureIndex({ fieldName: 'a', unique: true })
        await collection.ensureIndex({ fieldName: 'b', unique: true })
        await collection.ensureIndex({ fieldName: 'c', unique: true })

        const _doc1 = await collection.insert({ a: 1, b: 10, c: 100 })
        const _doc2 = await collection.insert({ a: 2, b: 20, c: 200 })
        const _doc3 = await collection.insert({ a: 3, b: 30, c: 300 })

        // Will conflict with doc3
        await expect(
          collection.update(
            { a: 2 },
            { $inc: { a: 10, c: 1000 }, $set: { b: 30 } },
            {},
          ),
        ).rejects.toThrow()

        const data = collection.getAllData(),
          doc1 = find(data, doc => doc._id === _doc1._id),
          doc2 = find(data, doc => doc._id === _doc2._id),
          doc3 = find(data, doc => doc._id === _doc3._id)

        // Data left unchanged
        expect(data).toHaveLength(3)
        assert.deepEqual(doc1, { a: 1, b: 10, c: 100, _id: _doc1._id })
        assert.deepEqual(doc2, { a: 2, b: 20, c: 200, _id: _doc2._id })
        assert.deepEqual(doc3, { a: 3, b: 30, c: 300, _id: _doc3._id })

        // All indexes left unchanged and pointing to the same docs
        expect(collection.indexes.a.tree.getNumberOfKeys()).toEqual(3)
        expect(collection.indexes.a.getMatching(1)[0]).toEqual(doc1)
        expect(collection.indexes.a.getMatching(2)[0]).toEqual(doc2)
        expect(collection.indexes.a.getMatching(3)[0]).toEqual(doc3)

        expect(collection.indexes.b.tree.getNumberOfKeys()).toEqual(3)
        expect(collection.indexes.b.getMatching(10)[0]).toEqual(doc1)
        expect(collection.indexes.b.getMatching(20)[0]).toEqual(doc2)
        expect(collection.indexes.b.getMatching(30)[0]).toEqual(doc3)

        expect(collection.indexes.c.tree.getNumberOfKeys()).toEqual(3)
        expect(collection.indexes.c.getMatching(100)[0]).toEqual(doc1)
        expect(collection.indexes.c.getMatching(200)[0]).toEqual(doc2)
        expect(collection.indexes.c.getMatching(300)[0]).toEqual(doc3)
      })

      it('If a multi update violates a contraint, all changes are rolled back and an error is thrown', async function () {
        await collection.ensureIndex({ fieldName: 'a', unique: true })
        await collection.ensureIndex({ fieldName: 'b', unique: true })
        await collection.ensureIndex({ fieldName: 'c', unique: true })

        const _doc1 = await collection.insert({ a: 1, b: 10, c: 100 })
        const _doc2 = await collection.insert({ a: 2, b: 20, c: 200 })
        const _doc3 = await collection.insert({ a: 3, b: 30, c: 300 })

        await expect(
          collection.update(
            { a: { $in: [1, 2] } },
            { $inc: { a: 10, c: 1000 }, $set: { b: 30 } },
            { multi: true },
          ),
        ).rejects.toThrow()

        const data = collection.getAllData()
        const doc1 = data.find(doc => doc._id === _doc1._id)
        const doc2 = data.find(doc => doc._id === _doc2._id)
        const doc3 = data.find(doc => doc._id === _doc3._id)

        // Data left unchanged
        expect(data).toHaveLength(3)
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
        expect(collection.indexes.a.tree.getNumberOfKeys()).toEqual(3)
        expect(collection.indexes.a.getMatching(1)[0]).toEqual(doc1)
        expect(collection.indexes.a.getMatching(2)[0]).toEqual(doc2)
        expect(collection.indexes.a.getMatching(3)[0]).toEqual(doc3)

        expect(collection.indexes.b.tree.getNumberOfKeys()).toEqual(3)
        expect(collection.indexes.b.getMatching(10)[0]).toEqual(doc1)
        expect(collection.indexes.b.getMatching(20)[0]).toEqual(doc2)
        expect(collection.indexes.b.getMatching(30)[0]).toEqual(doc3)

        expect(collection.indexes.c.tree.getNumberOfKeys()).toEqual(3)
        expect(collection.indexes.c.getMatching(100)[0]).toEqual(doc1)
        expect(collection.indexes.c.getMatching(200)[0]).toEqual(doc2)
        expect(collection.indexes.c.getMatching(300)[0]).toEqual(doc3)
      })
    })

    describe('Updating indexes upon document remove', function () {
      it('Removing docs still works as before with indexing', async function () {
        await collection.ensureIndex({ fieldName: 'a' })

        await collection.insert({ a: 1, b: 'hello' })
        const doc2 = await collection.insert({ a: 2, b: 'si' })
        const doc3 = await collection.insert({ a: 3, b: 'coin' })

        let nr = await collection.remove({ a: 1 }, {})
        let data = collection.getAllData()
        const found2 = data.find(doc => doc._id === doc2._id)
        const found3 = data.find(doc => doc._id === doc3._id)

        assert.equal(nr, 1)
        assert.equal(data.length, 2)
        assert.deepEqual(found2, { a: 2, b: 'si', _id: doc2._id })
        assert.deepEqual(found3, { a: 3, b: 'coin', _id: doc3._id })

        nr = await collection.remove({ a: { $in: [2, 3] } }, { multi: true })
        data = collection.getAllData()

        assert.equal(nr, 2)
        assert.equal(data.length, 0)

        expect(await collection.remove({ a: 1 }, {})).to.equal(0)
        expect(
          await collection.remove({ a: { $in: [2, 3] } }, { multi: true }),
        ).to.equal(0)
      })

      it('Indexes get updated when a document (or multiple documents) is removed', async function () {
        await collection.ensureIndex({ fieldName: 'a' })
        await collection.ensureIndex({ fieldName: 'b' })

        await collection.insert({ a: 1, b: 'hello' })
        const doc2 = await collection.insert({ a: 2, b: 'si' })
        const doc3 = await collection.insert({ a: 3, b: 'coin' })

        // Simple remove
        let nr = await collection.remove({ a: 1 }, {})
        assert.equal(nr, 1)

        assert.equal(collection.indexes.a.tree.getNumberOfKeys(), 2)
        assert.equal(collection.indexes.a.getMatching(2)[0]._id, doc2._id)
        assert.equal(collection.indexes.a.getMatching(3)[0]._id, doc3._id)

        assert.equal(collection.indexes.b.tree.getNumberOfKeys(), 2)
        assert.equal(collection.indexes.b.getMatching('si')[0]._id, doc2._id)
        assert.equal(collection.indexes.b.getMatching('coin')[0]._id, doc3._id)

        // The same pointers are shared between all indexes
        assert.equal(collection.indexes.a.tree.getNumberOfKeys(), 2)
        assert.equal(collection.indexes.b.tree.getNumberOfKeys(), 2)
        assert.equal(collection.indexes._id.tree.getNumberOfKeys(), 2)
        assert.equal(
          collection.indexes.a.getMatching(2)[0],
          collection.indexes._id.getMatching(doc2._id)[0],
        )
        assert.equal(
          collection.indexes.b.getMatching('si')[0],
          collection.indexes._id.getMatching(doc2._id)[0],
        )
        assert.equal(
          collection.indexes.a.getMatching(3)[0],
          collection.indexes._id.getMatching(doc3._id)[0],
        )
        assert.equal(
          collection.indexes.b.getMatching('coin')[0],
          collection.indexes._id.getMatching(doc3._id)[0],
        )

        // Multi remove
        nr = await collection.remove({}, { multi: true })
        assert.equal(nr, 2)

        assert.equal(collection.indexes.a.tree.getNumberOfKeys(), 0)
        assert.equal(collection.indexes.b.tree.getNumberOfKeys(), 0)
        assert.equal(collection.indexes._id.tree.getNumberOfKeys(), 0)
      })
    })

    describe('Persisting indexes', function () {
      it('Indexes are persisted to a separate file and recreated upon reload', async function () {
        const persDb = 'workspace/persistIndexes.db'

        await mkdirp(path.dirname(persDb))
        if (fs.existsSync(persDb)) {
          fs.writeFileSync(persDb, '', 'utf8')
        }

        let db = await createCollection({
          name: persDb,
          autoload: true,
          storage: new NodeStorage(),
        })

        assert.strictEqual(Object.keys(db.indexes).length, 1)
        assert.strictEqual(Object.keys(db.indexes)[0], '_id')

        await db.insert({ planet: 'Earth' })
        await db.insert({ planet: 'Mars' })

        await db.ensureIndex({ fieldName: 'planet' })

        assert.strictEqual(Object.keys(db.indexes).length, 2)
        assert.strictEqual(Object.keys(db.indexes)[0], '_id')
        assert.strictEqual(Object.keys(db.indexes)[1], 'planet')
        assert.strictEqual(db.indexes._id.getAll().length, 2)
        assert.strictEqual(db.indexes.planet.getAll().length, 2)
        assert.strictEqual(db.indexes.planet.fieldName, 'planet')

        // After a reload the indexes are recreated
        db = new Collection({ name: persDb, storage: new NodeStorage() })
        await db.loadDatabase()

        assert.strictEqual(Object.keys(db.indexes).length, 2)
        assert.strictEqual(Object.keys(db.indexes)[0], '_id')
        assert.strictEqual(Object.keys(db.indexes)[1], 'planet')
        assert.strictEqual(db.indexes._id.getAll().length, 2)
        assert.strictEqual(db.indexes.planet.getAll().length, 2)
        assert.strictEqual(db.indexes.planet.fieldName, 'planet')

        // After another reload the indexes are still there (i.e. they are preserved during autocompaction)
        db = new Collection({ name: persDb, storage: new NodeStorage() })
        await db.loadDatabase()

        assert.strictEqual(Object.keys(db.indexes).length, 2)
        assert.strictEqual(Object.keys(db.indexes)[0], '_id')
        assert.strictEqual(Object.keys(db.indexes)[1], 'planet')
        assert.strictEqual(db.indexes._id.getAll().length, 2)
        assert.strictEqual(db.indexes.planet.getAll().length, 2)
        assert.strictEqual(db.indexes.planet.fieldName, 'planet')
      })

      it('Indexes are persisted with their options and recreated even if some db operation happen between loads', async () => {
        const persDb = 'workspace/persistIndexes.db'

        let db

        await mkdirp(path.dirname(persDb))
        if (fs.existsSync(persDb)) {
          fs.writeFileSync(persDb, '', 'utf8')
        }

        db = await createCollection({
          name: persDb,
          autoload: true,
          storage: new NodeStorage(),
        })

        expect(Object.keys(db.indexes)).toHaveLength(1)
        expect(Object.keys(db.indexes)[0]).toEqual('_id')

        await db.insert({ planet: 'Earth' })
        await db.insert({ planet: 'Mars' })

        await db.ensureIndex({
          fieldName: 'planet',
          unique: true,
          sparse: false,
        })

        expect(Object.keys(db.indexes)).toHaveLength(2)
        expect(Object.keys(db.indexes)[0]).toEqual('_id')
        expect(Object.keys(db.indexes)[1]).toEqual('planet')

        expect(db.indexes._id.getAll()).toHaveLength(2)
        expect(db.indexes.planet.getAll()).toHaveLength(2)
        expect(db.indexes.planet.unique).toEqual(true)
        expect(db.indexes.planet.sparse).toEqual(false)

        await db.insert({ planet: 'Jupiter' })

        // After a reload the indexes are recreated
        db = new Collection({ name: persDb, storage: new NodeStorage() })
        await db.loadDatabase()

        expect(Object.keys(db.indexes)).toHaveLength(2)
        expect(Object.keys(db.indexes)[0]).toEqual('_id')
        expect(Object.keys(db.indexes)[1]).toEqual('planet')
        expect(db.indexes._id.getAll()).toHaveLength(3)
        expect(db.indexes.planet.getAll()).toHaveLength(3)
        expect(db.indexes.planet.unique).toEqual(true)
        expect(db.indexes.planet.sparse).toEqual(false)

        await db.ensureIndex({
          fieldName: 'bloup',
          unique: false,
          sparse: true,
        })

        expect(Object.keys(db.indexes)).toHaveLength(3)
        expect(Object.keys(db.indexes)[0]).toEqual('_id')
        expect(Object.keys(db.indexes)[1]).toEqual('planet')
        expect(Object.keys(db.indexes)[2]).toEqual('bloup')
        expect(db.indexes._id.getAll()).toHaveLength(3)
        expect(db.indexes.planet.getAll()).toHaveLength(3)
        expect(db.indexes.bloup.getAll()).toHaveLength(0)
        expect(db.indexes.planet.unique).toEqual(true)
        expect(db.indexes.planet.sparse).toEqual(false)
        expect(db.indexes.bloup.unique).toEqual(false)
        expect(db.indexes.bloup.sparse).toEqual(true)

        // After another reload the indexes are still there (i.e. they are preserved during autocompaction)
        db = new Collection({ name: persDb, storage: new NodeStorage() })
        await db.loadDatabase()

        expect(Object.keys(db.indexes)).toHaveLength(3)
        expect(Object.keys(db.indexes)[0]).toEqual('_id')
        expect(Object.keys(db.indexes)[1]).toEqual('planet')
        expect(Object.keys(db.indexes)[2]).toEqual('bloup')
        expect(db.indexes._id.getAll()).toHaveLength(3)
        expect(db.indexes.planet.getAll()).toHaveLength(3)
        expect(db.indexes.bloup.getAll()).toHaveLength(0)
        expect(db.indexes.planet.unique).toEqual(true)
        expect(db.indexes.planet.sparse).toEqual(false)
        expect(db.indexes.bloup.unique).toEqual(false)
        expect(db.indexes.bloup.sparse).toEqual(true)
      })

      it('Indexes can also be removed and the remove persisted', async function () {
        const persDb = 'workspace/persistIndexes.db'

        let db

        await mkdirp(path.dirname(persDb))
        if (fs.existsSync(persDb)) {
          fs.writeFileSync(persDb, '', 'utf8')
        }

        db = await createCollection({
          name: persDb,
          autoload: true,
          storage: new NodeStorage(),
        })

        expect(Object.keys(db.indexes)).toHaveLength(1)
        expect(Object.keys(db.indexes)[0]).toEqual('_id')

        await db.insert({ planet: 'Earth' })
        await db.insert({ planet: 'Mars' })

        await db.ensureIndex({ fieldName: 'planet' })
        await db.ensureIndex({ fieldName: 'another' })

        expect(Object.keys(db.indexes)).toHaveLength(3)
        expect(Object.keys(db.indexes)[0]).toEqual('_id')
        expect(Object.keys(db.indexes)[1]).toEqual('planet')
        expect(Object.keys(db.indexes)[2]).toEqual('another')
        expect(db.indexes._id.getAll()).toHaveLength(2)
        expect(db.indexes.planet.getAll()).toHaveLength(2)
        expect(db.indexes.planet.fieldName).toEqual('planet')

        // After a reload the indexes are recreated
        db = new Collection({ name: persDb, storage: new NodeStorage() })

        await db.loadDatabase()

        expect(Object.keys(db.indexes)).toHaveLength(3)
        expect(Object.keys(db.indexes)[0]).toEqual('_id')
        expect(Object.keys(db.indexes)[1]).toEqual('planet')
        expect(Object.keys(db.indexes)[2]).toEqual('another')
        expect(db.indexes._id.getAll()).toHaveLength(2)
        expect(db.indexes.planet.getAll()).toHaveLength(2)
        expect(db.indexes.planet.fieldName).toEqual('planet')

        // Index is removed
        db.removeIndex('planet')

        expect(Object.keys(db.indexes)).toHaveLength(2)
        expect(Object.keys(db.indexes)[0]).toEqual('_id')
        expect(Object.keys(db.indexes)[1]).toEqual('another')
        expect(db.indexes._id.getAll()).toHaveLength(2)

        // After a reload indexes are preserved
        db = new Collection({ name: persDb, storage: new NodeStorage() })

        await db.loadDatabase()

        expect(Object.keys(db.indexes)).toHaveLength(2)
        expect(Object.keys(db.indexes)[0]).toEqual('_id')
        expect(Object.keys(db.indexes)[1]).toEqual('another')
        expect(db.indexes._id.getAll()).toHaveLength(2)

        // After another reload the indexes are still there (i.e. they are preserved during autocompaction)
        db = new Collection({ name: persDb, storage: new NodeStorage() })
        await db.loadDatabase()

        expect(Object.keys(db.indexes)).toHaveLength(2)
        expect(Object.keys(db.indexes)[0]).toEqual('_id')
        expect(Object.keys(db.indexes)[1]).toEqual('another')
        expect(db.indexes._id.getAll()).toHaveLength(2)
      })
    })

    it('Results of getMatching should never contain duplicates', async function () {
      await collection.ensureIndex({ fieldName: 'bad' })
      await collection.insert({ bad: ['a', 'b'] })

      const res = await collection.getCandidates({ bad: { $in: ['a', 'b'] } })

      assert.strictEqual(res.length, 1)
    })
  })

  describe('Hooks', () => {
    it('should call beforeInsert', async () => {
      let called = null

      const collection = await createCollection({
        beforeInsert: async doc => {
          called = doc

          Object.assign(doc, { modified: true })

          return doc
        },
      })

      const doc = await collection.insert({ hello: 'world' })

      expect(doc).to.deep.equal({ ...doc, modified: true })
    })

    it('should call afterInsert', async () => {
      let called = null

      const collection = await createCollection({
        afterInsert: async doc => {
          called = doc
        },
      })

      const doc = await collection.insert({ hello: 'world' })
      expect(called).to.deep.equal(doc)
    })

    it('should call afterUpdate', async () => {
      let called1 = null
      let called2 = null

      const collection = await createCollection({
        afterUpdate: async (newDoc, oldDoc) => {
          called1 = newDoc
          called2 = oldDoc
        },
      })

      const doc = await collection.insert({ hello: 'world' })
      await collection.update({ hello: 'world' }, { hello: 'mars' })

      expect(called1).to.deep.equal({ ...doc, hello: 'mars' })
      expect(called2).to.deep.equal(doc)
    })

    it('should call beforeRemove', async () => {
      let called = false

      const collection = await createCollection({
        beforeRemove: async doc => {
          called = doc
          return doc
        },
      })

      const doc = await collection.insert({ hello: 'world' })
      await collection.remove({ hello: 'world' })

      expect(called).to.deep.equal(doc)
    })

    it('should call afterRemove', async () => {
      let called = false

      const collection = await createCollection({
        afterRemove: async doc => {
          called = doc
        },
      })

      const doc = await collection.insert({ hello: 'world' })

      await collection.remove({ hello: 'world' })

      expect(called).to.deep.equal(doc)
    })
  })

  describe('Ready State', function () {
    it('should wait for collection to be ready before executing operations', async () => {
      const collection = new Collection({})

      expect(collection.ready).to.be.false

      await collection.ensureReady()

      expect(collection.ready).to.be.true

      collection.ready = false

      // Start operations before ready
      const insertPromise = collection.insert({ test: 1 })
      const findPromise = collection.find({ test: 1 }).exec()
      const updatePromise = collection.update({ test: 1 }, { test: 2 })
      const removePromise = collection.remove({ test: 2 })

      expect(insertPromise).to.be.an.instanceOf(Promise)
      expect(findPromise).to.be.an.instanceOf(Promise)
      expect(updatePromise).to.be.an.instanceOf(Promise)
      expect(removePromise).to.be.an.instanceOf(Promise)

      // Trigger ready state
      collection.emit(CollectionEvent.READY)
      collection.ready = true

      // Operations should complete successfully after ready
      await insertPromise
      await findPromise
      await updatePromise
      await removePromise

      expect(collection.ready).to.be.true
    })
  })
})

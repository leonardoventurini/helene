import { assert } from 'chai'
import * as fs from 'fs'
import * as path from 'path'
import filter from 'lodash/filter'
import { Collection, Cursor } from '../../data'
import mkdirp from 'mkdirp'
import { pluck } from '../../data/utils'
import { NodeStorage } from '../../data/node'

const testDb = 'workspace/test.db'

describe('Cursor', () => {
  let collection: Collection

  beforeEach(async () => {
    collection = new Collection({
      name: testDb,
      storage: new NodeStorage(),
    })

    collection.name.should.equal(testDb)
    collection.inMemoryOnly.should.equal(false)

    await mkdirp(path.dirname(testDb))

    const exists = fs.existsSync(testDb)

    if (exists) {
      fs.unlinkSync(testDb)
    }

    await collection.loadDatabase()

    collection.getAllData().length.should.equal(0)
  })

  describe('Without sorting', () => {
    beforeEach(async () => {
      await collection.insert({ age: 5 })
      await collection.insert({ age: 57 })
      await collection.insert({ age: 52 })
      await collection.insert({ age: 23 })
      await collection.insert({ age: 89 })
    })

    it('should map results', async () => {
      const double = await collection
        .find({})
        .sort({ age: 1 })
        .map(doc => doc.age * 2)

      double.should.deep.equal([10, 46, 104, 114, 178])
    })

    it('Without query, an empty query or a simple query and no skip or limit', async () => {
      let cursor = new Cursor(collection)

      let docs = await cursor

      docs.length.should.equal(5)

      filter(docs, doc => doc.age === 5)[0].age.should.equal(5)

      filter(docs, doc => doc.age === 57)[0].age.should.equal(57)

      filter(docs, doc => doc.age === 52)[0].age.should.equal(52)

      filter(docs, doc => doc.age === 23)[0].age.should.equal(23)

      filter(docs, doc => doc.age === 89)[0].age.should.equal(89)

      cursor = new Cursor(collection, {})

      docs = await cursor

      docs.length.should.equal(5)

      filter(docs, doc => doc.age === 5)[0].age.should.equal(5)
      filter(docs, doc => doc.age === 57)[0].age.should.equal(57)
      filter(docs, doc => doc.age === 52)[0].age.should.equal(52)
      filter(docs, doc => doc.age === 23)[0].age.should.equal(23)
      filter(docs, doc => doc.age === 89)[0].age.should.equal(89)

      cursor = new Cursor(collection, { age: { $gt: 23 } })

      docs = await cursor

      docs.length.should.equal(3)

      filter(docs, doc => doc.age === 57)[0].age.should.equal(57)
      filter(docs, doc => doc.age === 52)[0].age.should.equal(52)
      filter(docs, doc => doc.age === 89)[0].age.should.equal(89)
    })

    it('With an empty collection', async () => {
      await collection.remove({}, { multi: true })
      const cursor = new Cursor(collection)
      const docs = await cursor
      docs.length.should.equal(0)
    })

    it('With a limit', async () => {
      const cursor = new Cursor(collection)
      cursor.limit(3)
      const docs = await cursor
      docs.length.should.equal(3)
    })

    it('With a skip', async () => {
      const cursor = new Cursor(collection)
      const docs = await cursor.skip(2)
      docs.length.should.equal(3)
    })

    it('With a limit and a skip and method chaining', async () => {
      const cursor = new Cursor(collection)
      cursor.limit(4).skip(3) // Only way to know that the right number of results was skipped is if limit + skip > number of results
      const docs = await cursor

      docs.length.should.equal(2)
    })
  })

  describe('Sorting of the results', function () {
    beforeEach(async () => {
      // We don't know the order in which docs wil be inserted but we ensure correctness by testing both sort orders
      await collection.insert({ age: 5 })
      await collection.insert({ age: 57 })
      await collection.insert({ age: 52 })
      await collection.insert({ age: 23 })
      await collection.insert({ age: 89 })
    })

    it('Using one sort', async () => {
      let i

      const cursor = new Cursor(collection, {})
      cursor.sort({ age: 1 })
      let docs = await cursor

      // Results are in ascending order
      for (i = 0; i < docs.length - 1; i += 1) {
        assert(docs[i].age < docs[i + 1].age)
      }

      cursor.sort({ age: -1 })
      docs = await cursor

      // Results are in descending order
      for (i = 0; i < docs.length - 1; i += 1) {
        assert(docs[i].age > docs[i + 1].age)
      }
    })

    it('Sorting strings with custom string comparison function', async () => {
      const db = new Collection({
        autoload: true,
        compareStrings: function (a, b) {
          return a.length - b.length
        },
      })

      await db.insert({ name: 'alpha' })
      await db.insert({ name: 'charlie' })
      await db.insert({ name: 'zulu' })

      let docs = await db.find({}).sort({ name: 1 })

      pluck(docs, 'name')[0].should.equal('zulu')
      pluck(docs, 'name')[1].should.equal('alpha')
      pluck(docs, 'name')[2].should.equal('charlie')

      delete db.compareStrings

      docs = await db.find({}).sort({ name: 1 })

      pluck(docs, 'name')[0].should.equal('alpha')
      pluck(docs, 'name')[1].should.equal('charlie')
      pluck(docs, 'name')[2].should.equal('zulu')
    })

    it('With an empty collection', async () => {
      await collection.remove({}, { multi: true })

      const cursor = new Cursor(collection)
      cursor.sort({ age: 1 })

      const docs = await cursor

      docs.length.should.equal(0)
    })

    it('Ability to chain sorting and exec', async function () {
      const cursor1 = new Cursor(collection)
      const docs1 = await cursor1.sort({ age: 1 })
      // Results are in ascending order
      for (let i = 0; i < docs1.length - 1; i += 1) {
        assert(docs1[i].age < docs1[i + 1].age)
      }

      const cursor2 = new Cursor(collection)
      const docs2 = await cursor2.sort({ age: -1 })
      // Results are in descending order
      for (let i = 0; i < docs2.length - 1; i += 1) {
        assert(docs2[i].age > docs2[i + 1].age)
      }
    })

    it('Using limit and sort', async function () {
      let i

      const cursor1 = new Cursor(collection)
      const docs1 = await cursor1.sort({ age: 1 }).limit(3)
      docs1.length.should.equal(3)
      docs1[0].age.should.equal(5)
      docs1[1].age.should.equal(23)
      docs1[2].age.should.equal(52)

      const cursor2 = new Cursor(collection)
      const docs2 = await cursor2.sort({ age: -1 }).limit(2)
      docs2.length.should.equal(2)
      docs2[0].age.should.equal(89)
      docs2[1].age.should.equal(57)
    })

    it('Using a limit higher than total number of docs shouldnt cause an error', async () => {
      const cursor = new Cursor(collection)
      const docs = await cursor.sort({ age: 1 }).limit(7)

      docs.length.should.equal(5)
      docs[0].age.should.equal(5)
      docs[1].age.should.equal(23)
      docs[2].age.should.equal(52)
      docs[3].age.should.equal(57)
      docs[4].age.should.equal(89)
    })

    it('Using limit and skip with sort', async () => {
      const cursor1 = new Cursor(collection)
      const result1 = await cursor1.sort({ age: 1 }).limit(1).skip(2)
      result1.length.should.equal(1)
      result1[0].age.should.equal(52)

      const cursor2 = new Cursor(collection)
      const result2 = await cursor2.sort({ age: 1 }).limit(3).skip(1)
      result2.length.should.equal(3)
      result2[0].age.should.equal(23)
      result2[1].age.should.equal(52)
      result2[2].age.should.equal(57)

      const cursor3 = new Cursor(collection)
      const result3 = await cursor3.sort({ age: -1 }).limit(2).skip(2)
      result3.length.should.equal(2)
      result3[0].age.should.equal(52)
      result3[1].age.should.equal(23)
    })

    it('Using too big a limit and a skip with sort', async () => {
      const cursor = new Cursor(collection)
      const docs = await cursor.sort({ age: 1 }).limit(8).skip(2)

      docs.length.should.equal(3)
      docs[0].age.should.equal(52)
      docs[1].age.should.equal(57)
      docs[2].age.should.equal(89)
    })

    it('Using too big a skip with sort should return no result', async function () {
      const cursor1 = new Cursor(collection)
      const cursor2 = new Cursor(collection)
      const cursor3 = new Cursor(collection)
      const cursor4 = new Cursor(collection)

      const docs1 = await cursor1.sort({ age: 1 }).skip(5)
      docs1.length.should.equal(0)

      const docs2 = await cursor2.sort({ age: 1 }).skip(7)
      docs2.length.should.equal(0)

      const docs3 = await cursor3.sort({ age: 1 }).limit(3).skip(7)
      docs3.length.should.equal(0)

      const docs4 = await cursor4.sort({ age: 1 }).limit(6).skip(7)
      docs4.length.should.equal(0)
    })

    it('Sorting strings', async function () {
      await collection.remove({}, { multi: true })
      await collection.insert({ name: 'jako' })
      await collection.insert({ name: 'jakeb' })
      await collection.insert({ name: 'sue' })

      const cursor1 = new Cursor(collection, {})
      const docs1 = await cursor1.sort({ name: 1 })
      docs1.length.should.equal(3)
      docs1[0].name.should.equal('jakeb')
      docs1[1].name.should.equal('jako')
      docs1[2].name.should.equal('sue')

      const cursor2 = new Cursor(collection, {})
      const docs2 = await cursor2.sort({ name: -1 })
      docs2.length.should.equal(3)
      docs2[0].name.should.equal('sue')
      docs2[1].name.should.equal('jako')
      docs2[2].name.should.equal('jakeb')
    })

    it('Sorting nested fields with dates', async function () {
      await collection.remove({}, { multi: true })

      const doc1 = await collection.insert({
        event: { recorded: new Date(400) },
      })
      const doc2 = await collection.insert({
        event: { recorded: new Date(60000) },
      })
      const doc3 = await collection.insert({
        event: { recorded: new Date(32) },
      })

      const cursor = new Cursor(collection, {})
      let docs = await cursor.sort({ 'event.recorded': 1 })
      docs.length.should.equal(3)
      docs[0]._id.should.equal(doc3._id)
      docs[1]._id.should.equal(doc1._id)
      docs[2]._id.should.equal(doc2._id)

      docs = await cursor.sort({ 'event.recorded': -1 })
      docs.length.should.equal(3)
      docs[0]._id.should.equal(doc2._id)
      docs[1]._id.should.equal(doc1._id)
      docs[2]._id.should.equal(doc3._id)
    })

    it('Sorting when some fields are undefined', async function () {
      await collection.remove({}, { multi: true })
      await collection.insert({ name: 'jako', other: 2 })
      await collection.insert({ name: 'jakeb', other: 3 })
      await collection.insert({ name: 'sue' })
      await collection.insert({ name: 'henry', other: 4 })

      let cursor = new Cursor(collection, {})
      let docs = await cursor.sort({ other: 1 })
      docs.length.should.equal(4)
      docs[0].name.should.equal('sue')
      assert.isUndefined(docs[0].other)
      docs[1].name.should.equal('jako')
      docs[1].other.should.equal(2)
      docs[2].name.should.equal('jakeb')
      docs[2].other.should.equal(3)
      docs[3].name.should.equal('henry')
      docs[3].other.should.equal(4)

      cursor = new Cursor(collection, {
        name: { $in: ['suzy', 'jakeb', 'jako'] },
      })
      docs = await cursor.sort({ other: -1 })
      docs.length.should.equal(2)
      docs[0].name.should.equal('jakeb')
      docs[0].other.should.equal(3)
      docs[1].name.should.equal('jako')
      docs[1].other.should.equal(2)
    })

    it('Sorting when all fields are undefined', async function () {
      await collection.remove({}, { multi: true })

      await Promise.all([
        collection.insert({ name: 'jako' }),
        collection.insert({ name: 'jakeb' }),
        collection.insert({ name: 'sue' }),
      ])

      let cursor = new Cursor(collection, {})
      let docs = await cursor.sort({ other: 1 })
      docs.length.should.equal(3)

      cursor = new Cursor(collection, {
        name: { $in: ['sue', 'jakeb', 'jakob'] },
      })
      docs = await cursor.sort({ other: -1 })
      docs.length.should.equal(2)
    })

    it('Multiple consecutive sorts', async function () {
      await collection.remove({}, { multi: true })
      await collection.insert({ name: 'jako', age: 43, nid: 1 })
      await collection.insert({ name: 'jakeb', age: 43, nid: 2 })
      await collection.insert({ name: 'sue', age: 12, nid: 3 })
      await collection.insert({ name: 'zoe', age: 23, nid: 4 })
      await collection.insert({ name: 'jako', age: 35, nid: 5 })

      let docs = await new Cursor(collection, {}).sort({ name: 1, age: -1 })

      docs.length.should.equal(5)
      docs[0].nid.should.equal(2)
      docs[1].nid.should.equal(1)
      docs[2].nid.should.equal(5)
      docs[3].nid.should.equal(3)
      docs[4].nid.should.equal(4)

      docs = await new Cursor(collection, {}).sort({ name: 1, age: 1 })
      docs.length.should.equal(5)
      docs[0].nid.should.equal(2)
      docs[1].nid.should.equal(5)
      docs[2].nid.should.equal(1)
      docs[3].nid.should.equal(3)
      docs[4].nid.should.equal(4)

      docs = await new Cursor(collection, {}).sort({ age: 1, name: 1 })
      docs.length.should.equal(5)
      docs[0].nid.should.equal(3)
      docs[1].nid.should.equal(4)
      docs[2].nid.should.equal(5)
      docs[3].nid.should.equal(2)
      docs[4].nid.should.equal(1)

      docs = await new Cursor(collection, {}).sort({ age: 1, name: -1 })
      docs.length.should.equal(5)
      docs[0].nid.should.equal(3)
      docs[1].nid.should.equal(4)
      docs[2].nid.should.equal(5)
      docs[3].nid.should.equal(1)
      docs[4].nid.should.equal(2)
    })

    it('Similar data, multiple consecutive sorts', async function () {
      let i, j, id
      const companies = ['acme', 'milkman', 'zoinks']
      const entities = []

      await collection.remove({}, { multi: true })

      id = 1
      for (i = 0; i < companies.length; i++) {
        for (j = 5; j <= 100; j += 5) {
          entities.push({
            company: companies[i],
            cost: j,
            nid: id,
          })
          id++
        }
      }

      for (const entity of entities) {
        await collection.insert(entity)
      }

      const cursor = new Cursor(collection, {})
      const docs = await cursor.sort({ company: 1, cost: 1 })
      docs.length.should.equal(60)

      for (let i = 0; i < docs.length; i++) {
        docs[i].nid.should.equal(i + 1)
      }
    })
  })

  describe('Projections', function () {
    let doc1, doc2, doc3, doc4, doc0

    beforeEach(async function () {
      doc0 = await collection.insert({
        age: 5,
        name: 'Jo',
        planet: 'B',
        toys: { bebe: true, ballon: 'much' },
      })
      doc1 = await collection.insert({
        age: 57,
        name: 'Louis',
        planet: 'R',
        toys: { ballon: 'yeah', bebe: false },
      })
      doc2 = await collection.insert({
        age: 52,
        name: 'Grafitti',
        planet: 'C',
        toys: { bebe: 'kind of' },
      })
      doc3 = await collection.insert({ age: 23, name: 'LM', planet: 'S' })
      doc4 = await collection.insert({ age: 89, planet: 'Earth' })
    })

    it('Takes all results if no projection or empty object given', async function () {
      const cursor = new Cursor(collection, {})
      cursor.sort({ age: 1 }) // For easier finding
      let docs = await cursor
      docs.length.should.equal(5)
      assert.deepEqual(docs[0], doc0)
      assert.deepEqual(docs[1], doc3)
      assert.deepEqual(docs[2], doc2)
      assert.deepEqual(docs[3], doc1)
      assert.deepEqual(docs[4], doc4)

      cursor.projection({})
      docs = await cursor
      docs.length.should.equal(5)
      assert.deepEqual(docs[0], doc0)
      assert.deepEqual(docs[1], doc3)
      assert.deepEqual(docs[2], doc2)
      assert.deepEqual(docs[3], doc1)
      assert.deepEqual(docs[4], doc4)
    })

    it('Can take only the expected fields', async function () {
      const cursor = new Cursor(collection, {})
      cursor.sort({ age: 1 }) // For easier finding
      cursor.projection({ age: 1, name: 1 })
      let docs = await cursor

      docs.length.should.equal(5)

      // Takes the _id by default
      assert.deepEqual(docs[0], { age: 5, name: 'Jo', _id: doc0._id })
      assert.deepEqual(docs[1], { age: 23, name: 'LM', _id: doc3._id })
      assert.deepEqual(docs[2], { age: 52, name: 'Grafitti', _id: doc2._id })
      assert.deepEqual(docs[3], { age: 57, name: 'Louis', _id: doc1._id })
      assert.deepEqual(docs[4], { age: 89, _id: doc4._id }) // No problems if one field to take doesn't exist

      cursor.projection({ age: 1, name: 1, _id: 0 })
      docs = await cursor
      docs.length.should.equal(5)
      assert.deepEqual(docs[0], { age: 5, name: 'Jo' })
      assert.deepEqual(docs[1], { age: 23, name: 'LM' })
      assert.deepEqual(docs[2], { age: 52, name: 'Grafitti' })
      assert.deepEqual(docs[3], { age: 57, name: 'Louis' })
      assert.deepEqual(docs[4], { age: 89 }) // No problems if one field to take doesn't exist
    })

    it('Can omit only the expected fields', async function () {
      const cursor = new Cursor(collection, {})
      cursor.sort({ age: 1 }) // For easier finding
      cursor.projection({ age: 0, name: 0 })

      let docs = await cursor
      docs.length.should.equal(5)

      // Takes the _id by default
      assert.deepEqual(docs[0], {
        planet: 'B',
        _id: doc0._id,
        toys: { bebe: true, ballon: 'much' },
      })
      assert.deepEqual(docs[1], { planet: 'S', _id: doc3._id })
      assert.deepEqual(docs[2], {
        planet: 'C',
        _id: doc2._id,
        toys: { bebe: 'kind of' },
      })
      assert.deepEqual(docs[3], {
        planet: 'R',
        _id: doc1._id,
        toys: { bebe: false, ballon: 'yeah' },
      })
      assert.deepEqual(docs[4], { planet: 'Earth', _id: doc4._id })

      cursor.projection({ age: 0, name: 0, _id: 0 })

      docs = await cursor
      docs.length.should.equal(5)
      assert.deepEqual(docs[0], {
        planet: 'B',
        toys: { bebe: true, ballon: 'much' },
      })
      assert.deepEqual(docs[1], { planet: 'S' })
      assert.deepEqual(docs[2], { planet: 'C', toys: { bebe: 'kind of' } })
      assert.deepEqual(docs[3], {
        planet: 'R',
        toys: { bebe: false, ballon: 'yeah' },
      })
      assert.deepEqual(docs[4], { planet: 'Earth' })
    })

    it('Cannot use both modes except for _id', async function () {
      const cursor = new Cursor(collection, {})
      cursor.sort({ age: 1 }) // For easier finding
      cursor.projection({ age: 1, name: 0 })

      let err = null
      let docs = null

      try {
        docs = await cursor
      } catch (e) {
        err = e
      }

      assert.isNotNull(err)
      assert.notExists(docs)

      cursor.projection({ age: 1, _id: 0 })

      docs = await cursor

      assert.deepEqual(docs[0], { age: 5 })
      assert.deepEqual(docs[1], { age: 23 })
      assert.deepEqual(docs[2], { age: 52 })
      assert.deepEqual(docs[3], { age: 57 })
      assert.deepEqual(docs[4], { age: 89 })

      cursor.projection({ age: 0, toys: 0, planet: 0, _id: 1 })

      docs = await cursor

      assert.deepEqual(docs[0], { name: 'Jo', _id: doc0._id })
      assert.deepEqual(docs[1], { name: 'LM', _id: doc3._id })
      assert.deepEqual(docs[2], { name: 'Grafitti', _id: doc2._id })
      assert.deepEqual(docs[3], { name: 'Louis', _id: doc1._id })
      assert.deepEqual(docs[4], { _id: doc4._id })
    })

    it('Projections on embedded documents - omit type', async function () {
      const cursor = new Cursor(collection, {})
      cursor.sort({ age: 1 }) // For easier finding
      cursor.projection({ name: 0, planet: 0, 'toys.bebe': 0, _id: 0 })
      const docs = await cursor
      assert.deepEqual(docs[0], { age: 5, toys: { ballon: 'much' } })
      assert.deepEqual(docs[1], { age: 23 })
      assert.deepEqual(docs[2], { age: 52, toys: {} })
      assert.deepEqual(docs[3], { age: 57, toys: { ballon: 'yeah' } })
      assert.deepEqual(docs[4], { age: 89 })
    })

    it('Projections on embedded documents - pick type', async function () {
      const cursor = new Cursor(collection, {})
      cursor.sort({ age: 1 }) // For easier finding
      cursor.projection({ name: 1, 'toys.ballon': 1, _id: 0 })
      const docs = await cursor

      assert.deepEqual(docs[0], { name: 'Jo', toys: { ballon: 'much' } })
      assert.deepEqual(docs[1], { name: 'LM' })
      assert.deepEqual(docs[2], { name: 'Grafitti' })
      assert.deepEqual(docs[3], { name: 'Louis', toys: { ballon: 'yeah' } })
      assert.deepEqual(docs[4], {})
    })
  })
})

import { assert, expect } from 'chai'

import fs from 'fs'

import path from 'path'

import _ from 'lodash'

import { Collection } from '../../data/collection'
import { Persistence } from '../../data/persistence'
import { deserialize, serialize } from '../../data/serialization'
import { Storage } from '../../data/storage'

const testDb = 'workspace/test.db'

describe('Persistence', function () {
  let d

  beforeEach(async () => {
    d = new Collection({ filename: testDb })
    assert.strictEqual(d.filename, testDb)
    assert.strictEqual(d.inMemoryOnly, false)

    await fs.promises.rm(path.dirname(testDb), { recursive: true, force: true })

    await d.loadDatabase()
    assert.strictEqual(d.getAllData().length, 0)
  })

  it('Every line represents a document', function () {
    const now = new Date(),
      rawData =
        serialize({ _id: '1', a: 2, ages: [1, 5, 12] }) +
        '\n' +
        serialize({ _id: '2', hello: 'world' }) +
        '\n' +
        serialize({ _id: '3', nested: { today: now } }),
      treatedData = d.persistence.treatRawData(rawData).data
    treatedData.sort(function (a, b) {
      return a._id - b._id
    })
    treatedData.length.should.equal(3)
    _.isEqual(treatedData[0], {
      _id: '1',
      a: 2,
      ages: [1, 5, 12],
    }).should.equal(true)
    _.isEqual(treatedData[1], { _id: '2', hello: 'world' }).should.equal(true)
    _.isEqual(treatedData[2], {
      _id: '3',
      nested: { today: now },
    }).should.equal(true)
  })

  it('Badly formatted lines have no impact on the treated data', function () {
    const now = new Date(),
      rawData =
        serialize({ _id: '1', a: 2, ages: [1, 5, 12] }) +
        '\n' +
        'garbage\n' +
        serialize({ _id: '3', nested: { today: now } }),
      treatedData = d.persistence.treatRawData(rawData).data
    treatedData.sort(function (a, b) {
      return a._id - b._id
    })
    treatedData.length.should.equal(2)
    _.isEqual(treatedData[0], {
      _id: '1',
      a: 2,
      ages: [1, 5, 12],
    }).should.equal(true)
    _.isEqual(treatedData[1], {
      _id: '3',
      nested: { today: now },
    }).should.equal(true)
  })

  it('Well formatted lines that have no _id are not included in the data', function () {
    const now = new Date(),
      rawData =
        serialize({ _id: '1', a: 2, ages: [1, 5, 12] }) +
        '\n' +
        serialize({ _id: '2', hello: 'world' }) +
        '\n' +
        serialize({ nested: { today: now } }),
      treatedData = d.persistence.treatRawData(rawData).data
    treatedData.sort(function (a, b) {
      return a._id - b._id
    })
    treatedData.length.should.equal(2)
    _.isEqual(treatedData[0], {
      _id: '1',
      a: 2,
      ages: [1, 5, 12],
    }).should.equal(true)
    _.isEqual(treatedData[1], { _id: '2', hello: 'world' }).should.equal(true)
  })

  it('If two lines concern the same doc (= same _id), the last one is the good version', function () {
    const now = new Date(),
      rawData =
        serialize({ _id: '1', a: 2, ages: [1, 5, 12] }) +
        '\n' +
        serialize({ _id: '2', hello: 'world' }) +
        '\n' +
        serialize({ _id: '1', nested: { today: now } }),
      treatedData = d.persistence.treatRawData(rawData).data
    treatedData.sort(function (a, b) {
      return a._id - b._id
    })
    treatedData.length.should.equal(2)
    _.isEqual(treatedData[0], {
      _id: '1',
      nested: { today: now },
    }).should.equal(true)
    _.isEqual(treatedData[1], { _id: '2', hello: 'world' }).should.equal(true)
  })

  it('If a doc contains $$deleted: true, that means we need to remove it from the data', function () {
    const now = new Date(),
      rawData =
        serialize({ _id: '1', a: 2, ages: [1, 5, 12] }) +
        '\n' +
        serialize({ _id: '2', hello: 'world' }) +
        '\n' +
        serialize({ _id: '1', $$deleted: true }) +
        '\n' +
        serialize({ _id: '3', today: now }),
      treatedData = d.persistence.treatRawData(rawData).data
    treatedData.sort(function (a, b) {
      return a._id - b._id
    })
    treatedData.length.should.equal(2)
    _.isEqual(treatedData[0], { _id: '2', hello: 'world' }).should.equal(true)
    _.isEqual(treatedData[1], { _id: '3', today: now }).should.equal(true)
  })

  it('If a doc contains $$deleted: true, no error is thrown if the doc wasnt in the list before', function () {
    const now = new Date(),
      rawData =
        serialize({ _id: '1', a: 2, ages: [1, 5, 12] }) +
        '\n' +
        serialize({ _id: '2', $$deleted: true }) +
        '\n' +
        serialize({ _id: '3', today: now }),
      treatedData = d.persistence.treatRawData(rawData).data
    treatedData.sort(function (a, b) {
      return a._id - b._id
    })
    treatedData.length.should.equal(2)
    _.isEqual(treatedData[0], {
      _id: '1',
      a: 2,
      ages: [1, 5, 12],
    }).should.equal(true)
    _.isEqual(treatedData[1], { _id: '3', today: now }).should.equal(true)
  })

  it('If a doc contains $$indexCreated, no error is thrown during treatRawData and we can get the index options', async () => {
    const now = new Date()
    const rawData =
      serialize({ _id: '1', a: 2, ages: [1, 5, 12] }) +
      '\n' +
      serialize({
        $$indexCreated: { fieldName: 'test', unique: true },
      }) +
      '\n' +
      serialize({ _id: '3', today: now })

    const { data: treatedData, indexes } = d.persistence.treatRawData(rawData)

    d.persistence.treatRawData(rawData)

    Object.keys(indexes).length.should.equal(1)
    assert.deepEqual(indexes.test, { fieldName: 'test', unique: true })

    treatedData.sort((a, b) => a._id - b._id)
    treatedData.length.should.equal(2)
    _.isEqual(treatedData[0], {
      _id: '1',
      a: 2,
      ages: [1, 5, 12],
    }).should.equal(true)
    _.isEqual(treatedData[1], { _id: '3', today: now }).should.equal(true)
  })

  it('Compact database on load', async function () {
    await d.insert({ a: 2 })
    await d.insert({ a: 4 })
    await d.remove({ a: 2 }, {})

    // Here, the underlying file is 3 lines long for only one document
    const data = fs.readFileSync(d.filename, 'utf8').split('\n')

    let filledCount = 0

    data.forEach(item => {
      if (item.length > 0) {
        filledCount += 1
      }
    })

    assert.strictEqual(filledCount, 3)

    await d.loadDatabase()

    // Now, the file has been compacted and is only 1 line long
    const data2 = fs.readFileSync(d.filename, 'utf8').split('\n')
    let filledCount2 = 0

    data2.forEach(item => {
      if (item.length > 0) {
        filledCount2 += 1
      }
    })
    assert.strictEqual(filledCount2, 1)
  })

  it('Calling loadDatabase after the data was modified doesnt change its contents', async function () {
    await d.loadDatabase()
    await d.insert({ a: 1 })
    await d.insert({ a: 2 })

    let data = d.getAllData()
    let doc1 = _.find(data, doc => doc.a === 1)
    let doc2 = _.find(data, doc => doc.a === 2)

    assert.equal(data.length, 2)
    assert.equal(doc1.a, 1)
    assert.equal(doc2.a, 2)

    await d.loadDatabase()

    data = d.getAllData()
    doc1 = _.find(data, doc => doc.a === 1)
    doc2 = _.find(data, doc => doc.a === 2)

    assert.equal(data.length, 2)
    assert.equal(doc1.a, 1)
    assert.equal(doc2.a, 2)
  })

  it('Calling loadDatabase after the datafile was removed will reset the database', async function () {
    await d.loadDatabase()
    await d.insert({ a: 1 })
    await d.insert({ a: 2 })
    const data = await d.find({}).exec()
    const doc1 = data.find(doc => doc.a === 1)
    const doc2 = data.find(doc => doc.a === 2)
    assert.equal(data.length, 2)
    assert.equal(doc1.a, 1)
    assert.equal(doc2.a, 2)

    await fs.promises.unlink(testDb)

    await d.loadDatabase()
    const allData = await d.find({}).exec()
    assert.equal(allData.length, 0)
  })

  it('Calling loadDatabase after the datafile was modified loads the new data', async function () {
    await d.loadDatabase()
    await d.insert({ a: 1 })
    await d.insert({ a: 2 })
    const data = d.getAllData()
    const doc1 = _.find(data, doc => doc.a === 1)
    const doc2 = _.find(data, doc => doc.a === 2)
    data.length.should.equal(2)
    doc1.a.should.equal(1)
    doc2.a.should.equal(2)

    await fs.promises.writeFile(testDb, '{"a":3,"_id":"aaa"}', 'utf8')

    await d.loadDatabase()
    const newData = d.getAllData()
    const newDoc1 = _.find(newData, doc => doc.a === 1)
    const newDoc2 = _.find(newData, doc => doc.a === 2)
    const newDoc3 = _.find(newData, doc => doc.a === 3)
    newData.length.should.equal(1)
    newDoc3.a.should.equal(3)
    assert.isUndefined(newDoc1)
    assert.isUndefined(newDoc2)
  })

  it('When treating raw data, refuse to proceed if too much data is corrupt, to avoid data loss', async function () {
    const corruptTestFilename = 'workspace/corruptTest.db'
    const fakeData =
      '{"_id":"one","hello":"world"}\n' +
      'Some corrupt data\n' +
      '{"_id":"two","hello":"earth"}\n' +
      '{"_id":"three","hello":"you"}\n'

    let d

    fs.writeFileSync(corruptTestFilename, fakeData, 'utf8')

    // Default corruptAlertThreshold
    d = new Collection({ filename: corruptTestFilename })
    await assert.isRejected(d.loadDatabase())

    fs.writeFileSync(corruptTestFilename, fakeData, 'utf8')
    d = new Collection({
      filename: corruptTestFilename,
      corruptAlertThreshold: 1,
    })
    await d.loadDatabase()

    fs.writeFileSync(corruptTestFilename, fakeData, 'utf8')
    d = new Collection({
      filename: corruptTestFilename,
      corruptAlertThreshold: 0,
    })
    await assert.isRejected(d.loadDatabase())
  })

  it('Can listen to compaction events', async () => {
    d.persistence.compactDatafile().catch(console.error)

    await d.waitFor('compaction.done')
  })

  describe('Serialization hooks', function () {
    const as = function (s) {
        return 'before_' + s + '_after'
      },
      bd = function (s) {
        return s.substring(7, s.length - 6)
      }

    it('Declaring only one hook will throw an exception to prevent data loss', async function () {
      const hookTestFilename = 'workspace/hookTest.db'
      await Storage.ensureFileDoesntExist(hookTestFilename)
      fs.writeFileSync(hookTestFilename, 'Some content', 'utf8')

      expect(() => {
        new Collection({
          filename: hookTestFilename,
          autoload: true,
          afterSerialization: as,
        })
      }).to.throw()

      // Data file left untouched
      assert.equal(fs.readFileSync(hookTestFilename, 'utf8'), 'Some content')

      await expect(() => {
        new Collection({
          filename: hookTestFilename,
          autoload: true,
          beforeDeserialization: bd,
        })
      }).to.throw()

      // Data file left untouched
      assert.equal(fs.readFileSync(hookTestFilename, 'utf8'), 'Some content')
    })

    it('Declaring two hooks that are not reverse of one another will cause an exception to prevent data loss', async function () {
      const hookTestFilename = 'workspace/hookTest.db'

      await Storage.ensureFileDoesntExist(hookTestFilename)

      fs.writeFileSync(hookTestFilename, 'Some content', 'utf8')

      expect(() => {
        new Collection({
          filename: hookTestFilename,
          autoload: true,
          afterSerialization: as,
          beforeDeserialization: function (s) {
            return s
          },
        })
      }).to.throw()

      // Data file left untouched
      assert.equal(fs.readFileSync(hookTestFilename, 'utf8'), 'Some content')
    })

    it('A serialization hook can be used to transform data before writing new state to disk', async function () {
      const hookTestFilename = 'workspace/hookTest.db'
      await Storage.ensureFileDoesntExist(hookTestFilename)

      const d = new Collection({
        filename: hookTestFilename,
        autoload: true,
        afterSerialization: as,
        beforeDeserialization: bd,
      })

      await d.waitFor('ready')

      await d.insert({ hello: 'world' })

      let _data = fs.readFileSync(hookTestFilename, 'utf8')

      let data = _data.split('\n')

      let doc0 = bd(data[0])

      assert.equal(data.length, 2)

      assert.equal(data[0].substring(0, 7), 'before_')
      assert.equal(data[0].substring(data[0].length - 6), '_after')

      doc0 = deserialize(doc0)
      assert.equal(Object.keys(doc0).length, 2)
      assert.equal(doc0.hello, 'world')

      await d.insert({ p: 'Mars' })
      _data = fs.readFileSync(hookTestFilename, 'utf8')
      data = _data.split('\n')

      let doc1 = bd(data[1])
      assert.equal(data.length, 3)

      assert.equal(data[0].substring(0, 7), 'before_')
      assert.equal(data[0].substring(data[0].length - 6), '_after')
      assert.equal(data[1].substring(0, 7), 'before_')
      assert.equal(data[1].substring(data[1].length - 6), '_after')

      assert.equal(Object.keys(doc0).length, 2)
      assert.equal(doc0.hello, 'world')

      doc1 = deserialize(doc1)
      assert.equal(Object.keys(doc1).length, 2)
      assert.equal(doc1.p, 'Mars')

      await d.ensureIndex({ fieldName: 'idefix' })
      _data = fs.readFileSync(hookTestFilename, 'utf8')
      data = _data.split('\n')

      let idx = bd(data[2])
      assert.equal(data.length, 4)

      assert.equal(data[0].substring(0, 7), 'before_')
      assert.equal(data[0].substring(data[0].length - 6), '_after')
      assert.equal(data[1].substring(0, 7), 'before_')
      assert.equal(data[1].substring(data[1].length - 6), '_after')

      assert.equal(Object.keys(doc0).length, 2)
      assert.equal(doc0.hello, 'world')

      assert.equal(Object.keys(doc1).length, 2)
      assert.equal(doc1.p, 'Mars')

      idx = deserialize(idx)
      assert.deepEqual(idx, { $$indexCreated: { fieldName: 'idefix' } })
    })

    it('Use serialization hook when persisting cached database or compacting', async () => {
      const hookTestFilename = 'workspace/hookTest.db'

      await Storage.ensureFileDoesntExist(hookTestFilename)

      const d = new Collection({
        filename: hookTestFilename,
        autoload: true,
        afterSerialization: as,
        beforeDeserialization: bd,
      })

      await d.waitFor('ready')

      await d.insert({ hello: 'world' })
      await d.update({ hello: 'world' }, { $set: { hello: 'earth' } }, {})
      await d.ensureIndex({ fieldName: 'idefix' })

      let _data = await fs.promises.readFile(hookTestFilename, 'utf8')
      let data = _data.split('\n')
      data.length.should.equal(4)

      let doc0 = bd(data[0])
      let doc1 = bd(data[1])
      let idx = bd(data[2])

      doc0 = deserialize(doc0)
      doc1 = deserialize(doc1)

      const _id = doc0._id
      doc0._id.should.equal(doc1._id)

      idx = deserialize(idx)
      assert.deepEqual(idx, {
        $$indexCreated: { fieldName: 'idefix' },
      })

      await d.persistence.persistCachedDatabase()
      _data = await fs.promises.readFile(hookTestFilename, 'utf8')
      data = _data.split('\n')
      data.length.should.equal(3)

      doc0 = bd(data[0])
      idx = bd(data[1])

      doc0 = deserialize(doc0)
      doc0._id.should.equal(_id)

      idx = deserialize(idx)
      assert.deepEqual(idx, {
        $$indexCreated: {
          fieldName: 'idefix',
          unique: false,
          sparse: false,
        },
      })
    })

    it('Deserialization hook is correctly used when loading data', async () => {
      const hookTestFilename = 'workspace/hookTest.db'

      await Storage.ensureFileDoesntExist(hookTestFilename)

      const d = new Collection({
        filename: hookTestFilename,
        autoload: true,
        afterSerialization: as,
        beforeDeserialization: bd,
      })

      await d.waitFor('ready')

      const doc = await d.insert({ hello: 'world' })
      const _id = doc._id

      await d.insert({ yo: 'ya' })
      await d.update({ hello: 'world' }, { $set: { hello: 'earth' } }, {})
      await d.remove({ yo: 'ya' }, {})
      await d.ensureIndex({ fieldName: 'idefix' })

      const _data = fs.readFileSync(hookTestFilename, 'utf8')
      const data = _data.split('\n')
      assert.strictEqual(data.length, 6)

      const d2 = new Collection({
        filename: hookTestFilename,
        afterSerialization: as,
        beforeDeserialization: bd,
      })

      await d2.loadDatabase()

      const docs = await d2.find({}).exec()

      assert.strictEqual(docs.length, 1)
      assert.strictEqual(docs[0].hello, 'earth')
      assert.strictEqual(docs[0]._id, _id)

      assert.strictEqual(Object.keys(d2.indexes).length, 2)
      assert.notStrictEqual(Object.keys(d2.indexes).indexOf('idefix'), -1)
    })
  })

  describe('Prevent dataloss when persisting data', () => {
    it('Creating a datastore with in memory as true and a bad filename wont cause an error', () => {
      new Collection({ filename: 'workspace/bad.db~', inMemoryOnly: true })
    })

    it('Creating a persistent datastore with a bad filename will cause an error', () => {
      expect(() => {
        new Collection({ filename: 'workspace/bad.db~' })
      }).to.throw()
    })

    it('If no file exists, ensureDatafileIntegrity creates an empty datafile', async function () {
      const p = new Persistence({
        db: new Collection({
          inMemoryOnly: false,
          filename: 'workspace/it.db',
        }),
      })

      if (fs.existsSync('workspace/it.db')) {
        fs.unlinkSync('workspace/it.db')
      }
      if (fs.existsSync('workspace/it.db~')) {
        fs.unlinkSync('workspace/it.db~')
      }

      assert.equal(fs.existsSync('workspace/it.db'), false)
      assert.equal(fs.existsSync('workspace/it.db~'), false)

      await Storage.ensureDatafileIntegrity(p.filename)

      assert.equal(fs.existsSync('workspace/it.db'), true)
      assert.equal(fs.existsSync('workspace/it.db~'), false)

      assert.equal(fs.readFileSync('workspace/it.db', 'utf8'), '')
    })

    it('If only datafile exists, ensureDatafileIntegrity will use it', async function () {
      const p = new Persistence({
        db: new Collection({
          inMemoryOnly: false,
          filename: 'workspace/it.db',
        }),
      })

      if (fs.existsSync('workspace/it.db')) {
        fs.unlinkSync('workspace/it.db')
      }

      if (fs.existsSync('workspace/it.db~')) {
        fs.unlinkSync('workspace/it.db~')
      }

      fs.writeFileSync('workspace/it.db', 'something', 'utf8')

      fs.existsSync('workspace/it.db').should.equal(true)
      fs.existsSync('workspace/it.db~').should.equal(false)

      await Storage.ensureDatafileIntegrity(p.filename)

      fs.existsSync('workspace/it.db').should.equal(true)
      fs.existsSync('workspace/it.db~').should.equal(false)

      fs.readFileSync('workspace/it.db', 'utf8').should.equal('something')
    })

    it('If temp datafile exists and datafile doesnt, ensureDatafileIntegrity will use it (cannot happen except upon first use)', async function () {
      const p = new Persistence({
        db: new Collection({
          inMemoryOnly: false,
          filename: 'workspace/it.db',
        }),
      })

      if (fs.existsSync('workspace/it.db')) {
        fs.unlinkSync('workspace/it.db')
      }
      if (fs.existsSync('workspace/it.db~')) {
        fs.unlinkSync('workspace/it.db~~')
      }

      fs.writeFileSync('workspace/it.db~', 'something', 'utf8')

      assert.strictEqual(fs.existsSync('workspace/it.db'), false)
      assert.strictEqual(fs.existsSync('workspace/it.db~'), true)

      await Storage.ensureDatafileIntegrity(p.filename)

      assert.strictEqual(fs.existsSync('workspace/it.db'), true)
      assert.strictEqual(fs.existsSync('workspace/it.db~'), false)

      assert.strictEqual(
        fs.readFileSync('workspace/it.db', 'utf8'),
        'something',
      )
    })

    it('If both temp and current datafiles exist, ensureDatafileIntegrity will use the datafile, as it means that the write of the temp file failed', async function () {
      const theDb = new Collection({ filename: 'workspace/it.db' })

      if (fs.existsSync('workspace/it.db')) {
        fs.unlinkSync('workspace/it.db')
      }
      if (fs.existsSync('workspace/it.db~')) {
        fs.unlinkSync('workspace/it.db~')
      }

      fs.writeFileSync('workspace/it.db', '{"_id":"0","hello":"world"}', 'utf8')
      fs.writeFileSync(
        'workspace/it.db~',
        '{"_id":"0","hello":"other"}',
        'utf8',
      )

      assert.equal(fs.existsSync('workspace/it.db'), true)
      assert.equal(fs.existsSync('workspace/it.db~'), true)

      await Storage.ensureDatafileIntegrity(theDb.persistence.filename)

      assert.equal(fs.existsSync('workspace/it.db'), true)
      assert.equal(fs.existsSync('workspace/it.db~'), true)
      assert.equal(
        fs.readFileSync('workspace/it.db', 'utf8'),
        '{"_id":"0","hello":"world"}',
      )

      await theDb.loadDatabase()
      const docs = await theDb.find({}).exec()

      assert.equal(docs.length, 1)
      assert.equal(docs[0].hello, 'world')
      assert.equal(fs.existsSync('workspace/it.db'), true)
      assert.equal(fs.existsSync('workspace/it.db~'), false)
    })

    it('persistCachedDatabase should update the contents of the datafile and leave a clean state', async function () {
      await d.insert({ hello: 'world' })
      const docs = await d.find({}).exec()
      assert.strictEqual(docs.length, 1)

      if (fs.existsSync(testDb)) {
        fs.unlinkSync(testDb)
      }
      if (fs.existsSync(testDb + '~')) {
        fs.unlinkSync(testDb + '~')
      }
      assert.strictEqual(fs.existsSync(testDb), false)

      fs.writeFileSync(testDb + '~', 'something', 'utf8')
      assert.strictEqual(fs.existsSync(testDb + '~'), true)

      await d.persistence.persistCachedDatabase()

      const contents = fs.readFileSync(testDb, 'utf8')
      assert.strictEqual(fs.existsSync(testDb), true)
      assert.strictEqual(fs.existsSync(testDb + '~'), false)
      assert.match(contents, /^{"hello":"world","_id":"[0-9a-zA-Z]{16}"}\n$/)
    })

    it('After a persistCachedDatabase, there should be no temp or old filename', async function () {
      await d.insert({ hello: 'world' })
      const docs = await d.find({}).exec()
      assert.strictEqual(docs.length, 1)

      if (fs.existsSync(testDb)) {
        fs.unlinkSync(testDb)
      }
      if (fs.existsSync(testDb + '~')) {
        fs.unlinkSync(testDb + '~')
      }
      assert.strictEqual(fs.existsSync(testDb), false)
      assert.strictEqual(fs.existsSync(testDb + '~'), false)

      fs.writeFileSync(testDb + '~', 'bloup', 'utf8')

      assert.strictEqual(fs.existsSync(testDb + '~'), true)

      await d.persistence.persistCachedDatabase()

      const contents = fs.readFileSync(testDb, 'utf8')
      assert.strictEqual(fs.existsSync(testDb), true)
      assert.strictEqual(fs.existsSync(testDb + '~'), false)

      assert.match(
        contents,
        /^{"hello":"world","_id":"[0-9a-zA-Z]{16}"}\n$/,
        'Datafile contents not as expected',
      )
    })

    it('persistCachedDatabase should update the contents of the datafile and leave a clean state even if there is a temp datafile', async () => {
      await d.insert({ hello: 'world' })
      const docs = await d.find({}).exec()
      assert.strictEqual(docs.length, 1)

      if (fs.existsSync(testDb)) {
        fs.unlinkSync(testDb)
      }
      fs.writeFileSync(testDb + '~', 'blabla', 'utf8')
      assert.strictEqual(fs.existsSync(testDb), false)
      assert.strictEqual(fs.existsSync(testDb + '~'), true)

      await d.persistence.persistCachedDatabase()

      const contents = fs.readFileSync(testDb, 'utf8')
      assert.strictEqual(fs.existsSync(testDb), true)
      assert.strictEqual(fs.existsSync(testDb + '~'), false)
      assert.match(contents, /^{"hello":"world","_id":"[0-9a-zA-Z]{16}"}\n$/)
    })

    it('persistCachedDatabase should update the contents of the datafile and leave a clean state even if there is a temp datafile', async () => {
      const dbFile = 'workspace/test2.db'

      if (fs.existsSync(dbFile)) {
        fs.unlinkSync(dbFile)
      }
      if (fs.existsSync(dbFile + '~')) {
        fs.unlinkSync(dbFile + '~')
      }

      const theDb = new Collection({ filename: dbFile })
      await theDb.loadDatabase()

      const contents = fs.readFileSync(dbFile, 'utf8')

      fs.existsSync(dbFile).should.equal(true)
      fs.existsSync(dbFile + '~').should.equal(false)

      assert.strictEqual(contents, '')
    })

    it('Persistence works as expected when everything goes fine', async function () {
      const dbFile = 'workspace/test2.db'

      await Storage.ensureFileDoesntExist(dbFile)
      await Storage.ensureFileDoesntExist(dbFile + '~')

      const theDb = new Collection({ filename: dbFile })
      await theDb.loadDatabase()

      let docs = await theDb.find({}).exec()
      assert.isEmpty(docs)

      const doc1 = await theDb.insert({ a: 'hello' })
      const doc2 = await theDb.insert({ a: 'world' })

      docs = await theDb.find({}).exec()
      assert.lengthOf(docs, 2)
      assert.equal(_.find(docs, { _id: doc1._id }).a, 'hello')
      assert.equal(_.find(docs, { _id: doc2._id }).a, 'world')

      await theDb.loadDatabase()

      docs = await theDb.find({}).exec()
      assert.lengthOf(docs, 2)
      assert.equal(_.find(docs, { _id: doc1._id }).a, 'hello')
      assert.equal(_.find(docs, { _id: doc2._id }).a, 'world')

      assert.isTrue(fs.existsSync(dbFile))
      assert.isFalse(fs.existsSync(dbFile + '~'))

      const theDb2 = new Collection({ filename: dbFile })
      await theDb2.loadDatabase()

      docs = await theDb2.find({}).exec()
      assert.lengthOf(docs, 2)
      assert.equal(_.find(docs, { _id: doc1._id }).a, 'hello')
      assert.equal(_.find(docs, { _id: doc2._id }).a, 'world')

      assert.isTrue(fs.existsSync(dbFile))
      assert.isFalse(fs.existsSync(dbFile + '~'))
    })
  })

  describe('ensureFileDoesntExist', () => {
    it('Doesnt do anything if file already doesnt exist', async () => {
      await Storage.ensureFileDoesntExist('workspace/nonexisting')
      assert.equal(fs.existsSync('workspace/nonexisting'), false)
    })

    it('Deletes file if it exists', async () => {
      fs.writeFileSync('workspace/existing', 'hello world', 'utf8')
      assert.equal(fs.existsSync('workspace/existing'), true)

      await Storage.ensureFileDoesntExist('workspace/existing')
      assert.equal(fs.existsSync('workspace/existing'), false)
    })
  })
})

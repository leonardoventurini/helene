import { assert, expect, describe, it, beforeEach } from 'vitest'

import fs from 'fs'

import path from 'path'

import { Collection, CollectionEvent, createCollection } from './collection'
import { Persistence } from './persistence'
import { deserialize, serialize } from './serialization'
import { ensureDatafileIntegrity, ensureFileDoesntExist } from './node/utils'
import { NodeStorage } from './node'
import find from 'lodash/find'
import isEqual from 'lodash/isEqual'
import { sleep } from '../utils'

const testDb = 'workspace/test.db'

describe('Persistence', function () {
  let d: Collection

  beforeEach(async () => {
    d = new Collection({ name: testDb, storage: new NodeStorage() })
    expect(d.name).toEqual(testDb)
    expect(d.inMemoryOnly).toEqual(false)

    await fs.promises.rm(path.dirname(testDb), { recursive: true, force: true })

    await d.loadDatabase()
    expect(d.getAllData().length).toEqual(0)
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
    expect(treatedData.length).toEqual(3)
    expect(
      isEqual(treatedData[0], {
        _id: '1',
        a: 2,
        ages: [1, 5, 12],
      }),
    ).toEqual(true)
    expect(isEqual(treatedData[1], { _id: '2', hello: 'world' })).toEqual(true)
    expect(
      isEqual(treatedData[2], {
        _id: '3',
        nested: { today: now },
      }),
    ).toEqual(true)
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
    expect(treatedData.length).toEqual(2)
    expect(
      isEqual(treatedData[0], {
        _id: '1',
        a: 2,
        ages: [1, 5, 12],
      }),
    ).toEqual(true)
    expect(
      isEqual(treatedData[1], {
        _id: '3',
        nested: { today: now },
      }),
    ).toEqual(true)
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
    expect(treatedData.length).toEqual(2)
    expect(
      isEqual(treatedData[0], {
        _id: '1',
        a: 2,
        ages: [1, 5, 12],
      }),
    ).toEqual(true)
    expect(isEqual(treatedData[1], { _id: '2', hello: 'world' })).toEqual(true)
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
    expect(treatedData.length).toEqual(2)
    expect(
      isEqual(treatedData[0], {
        _id: '1',
        nested: { today: now },
      }),
    ).toEqual(true)
    expect(isEqual(treatedData[1], { _id: '2', hello: 'world' })).toEqual(true)
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
    expect(treatedData.length).toEqual(2)
    expect(isEqual(treatedData[0], { _id: '2', hello: 'world' })).toEqual(true)
    expect(isEqual(treatedData[1], { _id: '3', today: now })).toEqual(true)
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
    expect(treatedData.length).toEqual(2)
    expect(
      isEqual(treatedData[0], {
        _id: '1',
        a: 2,
        ages: [1, 5, 12],
      }),
    ).toEqual(true)
    expect(isEqual(treatedData[1], { _id: '3', today: now })).toEqual(true)
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

    expect(Object.keys(indexes).length).toEqual(1)
    assert.deepEqual(indexes.test, { fieldName: 'test', unique: true })

    treatedData.sort((a, b) => a._id - b._id)
    expect(treatedData.length).toEqual(2)
    expect(
      isEqual(treatedData[0], {
        _id: '1',
        a: 2,
        ages: [1, 5, 12],
      }),
    ).toEqual(true)
    expect(isEqual(treatedData[1], { _id: '3', today: now })).toEqual(true)
  })

  it('Compact database on load', async function () {
    await d.insert({ a: 2 })
    await d.insert({ a: 4 })
    await d.remove({ a: 2 }, {})

    await sleep(100)

    // Here, the underlying file is 3 lines long for only one document
    const data = fs.readFileSync(d.name, 'utf8').split('\n')

    let filledCount = 0

    data.forEach(item => {
      if (item.length > 0) {
        filledCount += 1
      }
    })

    expect(filledCount).toEqual(3)

    await d.loadDatabase()

    // Now, the file has been compacted and is only 1 line long
    const data2 = fs.readFileSync(d.name, 'utf8').split('\n')
    let filledCount2 = 0

    data2.forEach(item => {
      if (item.length > 0) {
        filledCount2 += 1
      }
    })
    expect(filledCount2).toEqual(1)
  })

  it('Calling loadDatabase after the data was modified doesnt change its contents', async function () {
    await d.loadDatabase()
    await d.insert({ a: 1 })
    await d.insert({ a: 2 })

    let data = d.getAllData()
    let doc1 = find(data, doc => doc.a === 1)
    let doc2 = find(data, doc => doc.a === 2)

    expect(data.length).toEqual(2)
    expect(doc1.a).toEqual(1)
    expect(doc2.a).toEqual(2)

    await d.loadDatabase()

    data = d.getAllData()
    doc1 = find(data, doc => doc.a === 1)
    doc2 = find(data, doc => doc.a === 2)

    expect(data.length).toEqual(2)
    expect(doc1.a).toEqual(1)
    expect(doc2.a).toEqual(2)
  })

  it('Calling loadDatabase after the datafile was removed will reset the database', async function () {
    await d.loadDatabase()
    await d.insert({ a: 1 })
    await d.insert({ a: 2 })
    const data = await d.find({})
    const doc1 = data.find(doc => doc.a === 1)
    const doc2 = data.find(doc => doc.a === 2)
    expect(data.length).toEqual(2)
    expect(doc1.a).toEqual(1)
    expect(doc2.a).toEqual(2)

    await fs.promises.unlink(testDb)

    await d.loadDatabase()
    const allData = await d.find({})
    expect(allData.length).toEqual(0)
  })

  it('Calling loadDatabase after the datafile was modified loads the new data', async function () {
    await d.loadDatabase()
    await d.insert({ a: 1 })
    await d.insert({ a: 2 })
    const data = d.getAllData()
    const doc1 = find(data, doc => doc.a === 1)
    const doc2 = find(data, doc => doc.a === 2)
    expect(data.length).toEqual(2)
    expect(doc1.a).toEqual(1)
    expect(doc2.a).toEqual(2)

    await sleep(100)

    await fs.promises.writeFile(testDb, '{"a":3,"_id":"aaa"}', 'utf8')

    await d.loadDatabase()
    const newData = d.getAllData()
    const newDoc1 = find(newData, doc => doc.a === 1)
    const newDoc2 = find(newData, doc => doc.a === 2)
    const newDoc3 = find(newData, doc => doc.a === 3)
    expect(newData.length).toEqual(1)
    expect(newDoc3.a).toEqual(3)
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
    d = new Collection({
      name: corruptTestFilename,
      storage: new NodeStorage(),
    })
    await expect(d.loadDatabase()).rejects.toThrow()

    fs.writeFileSync(corruptTestFilename, fakeData, 'utf8')
    d = new Collection({
      name: corruptTestFilename,
      corruptAlertThreshold: 1,
      storage: new NodeStorage(),
    })
    await d.loadDatabase()

    fs.writeFileSync(corruptTestFilename, fakeData, 'utf8')
    d = new Collection({
      name: corruptTestFilename,
      corruptAlertThreshold: 0,
      storage: new NodeStorage(),
    })
    await expect(d.loadDatabase()).rejects.toThrow()
  })

  it('Can listen to compaction events', async () => {
    d.persistence.compactDatafile().catch(console.error)

    await d.waitFor(CollectionEvent.COMPACTED)
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
      await ensureFileDoesntExist(hookTestFilename)
      fs.writeFileSync(hookTestFilename, 'Some content', 'utf8')

      expect(() => {
        new Collection({
          name: hookTestFilename,
          autoload: true,
          afterSerialization: as,
        })
      }).toThrow()

      // Data file left untouched
      expect(fs.readFileSync(hookTestFilename, 'utf8')).toEqual('Some content')

      await expect(() => {
        new Collection({
          name: hookTestFilename,
          autoload: true,
          beforeDeserialization: bd,
        })
      }).toThrow()

      // Data file left untouched
      expect(fs.readFileSync(hookTestFilename, 'utf8')).toEqual('Some content')
    })

    it('Declaring two hooks that are not reverse of one another will cause an exception to prevent data loss', async function () {
      const hookTestFilename = 'workspace/hookTest.db'

      await ensureFileDoesntExist(hookTestFilename)

      fs.writeFileSync(hookTestFilename, 'Some content', 'utf8')

      expect(() => {
        new Collection({
          name: hookTestFilename,
          autoload: true,
          afterSerialization: as,
          beforeDeserialization: function (s) {
            return s
          },
        })
      }).toThrow()

      // Data file left untouched
      expect(fs.readFileSync(hookTestFilename, 'utf8')).toEqual('Some content')
    })

    it('A serialization hook can be used to transform data before writing new state to disk', async function () {
      const hookTestFilename = 'workspace/hookTest.db'
      await ensureFileDoesntExist(hookTestFilename)

      const d = await createCollection({
        name: hookTestFilename,
        autoload: true,
        afterSerialization: as,
        beforeDeserialization: bd,
        storage: new NodeStorage(),
      })

      await d.insert({ hello: 'world' })

      await sleep(100)

      let _data = fs.readFileSync(hookTestFilename, 'utf8')

      let data = _data.split('\n')

      let doc0 = bd(data[0])

      expect(data.length).toEqual(2)

      expect(data[0].substring(0, 7)).toEqual('before_')
      expect(data[0].substring(data[0].length - 6)).toEqual('_after')

      doc0 = deserialize(doc0)
      expect(Object.keys(doc0).length).toEqual(2)
      expect(doc0.hello).toEqual('world')

      await d.insert({ p: 'Mars' })

      await sleep(100)

      _data = fs.readFileSync(hookTestFilename, 'utf8')
      data = _data.split('\n')

      let doc1 = bd(data[1])
      expect(data.length).toEqual(3)

      expect(data[0].substring(0, 7)).toEqual('before_')
      expect(data[0].substring(data[0].length - 6)).toEqual('_after')
      expect(data[1].substring(0, 7)).toEqual('before_')
      expect(data[1].substring(data[1].length - 6)).toEqual('_after')

      expect(Object.keys(doc0).length).toEqual(2)
      expect(doc0.hello).toEqual('world')

      doc1 = deserialize(doc1)
      expect(Object.keys(doc1).length).toEqual(2)
      expect(doc1.p).toEqual('Mars')

      await d.ensureIndex({ fieldName: 'idefix' })
      _data = fs.readFileSync(hookTestFilename, 'utf8')
      data = _data.split('\n')

      let idx = bd(data[2])
      expect(data.length).toEqual(4)

      expect(data[0].substring(0, 7)).toEqual('before_')
      expect(data[0].substring(data[0].length - 6)).toEqual('_after')
      expect(data[1].substring(0, 7)).toEqual('before_')
      expect(data[1].substring(data[1].length - 6)).toEqual('_after')

      expect(Object.keys(doc0).length).toEqual(2)
      expect(doc0.hello).toEqual('world')

      expect(Object.keys(doc1).length).toEqual(2)
      expect(doc1.p).toEqual('Mars')

      idx = deserialize(idx)
      assert.deepEqual(idx, { $$indexCreated: { fieldName: 'idefix' } })
    })

    it('Use serialization hook when persisting cached database or compacting', async () => {
      const hookTestFilename = 'workspace/hookTest.db'

      await ensureFileDoesntExist(hookTestFilename)

      const d = await createCollection({
        name: hookTestFilename,
        autoload: true,
        afterSerialization: as,
        beforeDeserialization: bd,
        storage: new NodeStorage(),
      })

      await d.insert({ hello: 'world' })
      await d.update({ hello: 'world' }, { $set: { hello: 'earth' } }, {})
      await d.ensureIndex({ fieldName: 'idefix' })

      await sleep(100)

      let _data = await fs.promises.readFile(hookTestFilename, 'utf8')
      let data = _data.split('\n')
      expect(data.length).toEqual(4)

      let doc0 = bd(data[0])
      let doc1 = bd(data[1])
      let idx = bd(data[2])

      doc0 = deserialize(doc0)
      doc1 = deserialize(doc1)

      const _id = doc0._id
      expect(doc0._id).toEqual(doc1._id)

      idx = deserialize(idx)
      assert.deepEqual(idx, {
        $$indexCreated: { fieldName: 'idefix' },
      })

      await d.persistence.persistCachedDatabase()
      _data = await fs.promises.readFile(hookTestFilename, 'utf8')
      data = _data.split('\n')
      expect(data.length).toEqual(3)

      doc0 = bd(data[0])
      idx = bd(data[1])

      doc0 = deserialize(doc0)
      expect(doc0._id).toEqual(_id)

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

      await ensureFileDoesntExist(hookTestFilename)

      const d = await createCollection({
        name: hookTestFilename,
        autoload: true,
        afterSerialization: as,
        beforeDeserialization: bd,
        storage: new NodeStorage(),
      })

      const doc = await d.insert({ hello: 'world' })
      const _id = doc._id

      await d.insert({ yo: 'ya' })
      await d.update({ hello: 'world' }, { $set: { hello: 'earth' } }, {})
      await d.remove({ yo: 'ya' }, {})
      await d.ensureIndex({ fieldName: 'idefix' })

      const _data = fs.readFileSync(hookTestFilename, 'utf8')
      const data = _data.split('\n')
      expect(data.length).toEqual(6)

      const d2 = new Collection({
        name: hookTestFilename,
        afterSerialization: as,
        beforeDeserialization: bd,
        storage: new NodeStorage(),
      })

      await d2.loadDatabase()

      const docs = await d2.find({})

      expect(docs.length).toEqual(1)
      expect(docs[0].hello).toEqual('earth')
      expect(docs[0]._id).toEqual(_id)

      expect(Object.keys(d2.indexes).length).toEqual(2)
      assert.notStrictEqual(Object.keys(d2.indexes).indexOf('idefix'), -1)
    })
  })

  describe('Prevent dataloss when persisting data', () => {
    it('Creating a datastore with in memory as true and a bad filename wont cause an error', () => {
      new Collection({ name: 'workspace/bad.db~' })
    })

    it('Creating a persistent datastore with a bad filename will cause an error', () => {
      expect(() => {
        new Collection({
          name: 'workspace/bad.db~',
          storage: new NodeStorage(),
        })
      }).toThrow()
    })

    it('If no file exists, ensureDatafileIntegrity creates an empty datafile', async function () {
      const p = new Persistence({
        db: new Collection({
          name: 'workspace/it.db',
          storage: new NodeStorage(),
        }),
      })

      if (fs.existsSync('workspace/it.db')) {
        fs.unlinkSync('workspace/it.db')
      }
      if (fs.existsSync('workspace/it.db~')) {
        fs.unlinkSync('workspace/it.db~')
      }

      expect(fs.existsSync('workspace/it.db')).toEqual(false)
      expect(fs.existsSync('workspace/it.db~')).toEqual(false)

      await ensureDatafileIntegrity(p.name)

      expect(fs.existsSync('workspace/it.db')).toEqual(true)
      expect(fs.existsSync('workspace/it.db~')).toEqual(false)

      expect(fs.readFileSync('workspace/it.db', 'utf8')).toEqual('')
    })

    it('If only datafile exists, ensureDatafileIntegrity will use it', async function () {
      const p = new Persistence({
        db: new Collection({
          name: 'workspace/it.db',
          storage: new NodeStorage(),
        }),
      })

      if (fs.existsSync('workspace/it.db')) {
        fs.unlinkSync('workspace/it.db')
      }

      if (fs.existsSync('workspace/it.db~')) {
        fs.unlinkSync('workspace/it.db~')
      }

      fs.writeFileSync('workspace/it.db', 'something', 'utf8')

      expect(fs.existsSync('workspace/it.db')).toEqual(true)
      expect(fs.existsSync('workspace/it.db~')).toEqual(false)

      await ensureDatafileIntegrity(p.name)

      expect(fs.existsSync('workspace/it.db')).toEqual(true)
      expect(fs.existsSync('workspace/it.db~')).toEqual(false)

      expect(fs.readFileSync('workspace/it.db', 'utf8')).toEqual('something')
    })

    it('If temp datafile exists and datafile doesnt, ensureDatafileIntegrity will use it (cannot happen except upon first use)', async function () {
      const p = new Persistence({
        db: new Collection({
          name: 'workspace/it.db',
          storage: new NodeStorage(),
        }),
      })

      if (fs.existsSync('workspace/it.db')) {
        fs.unlinkSync('workspace/it.db')
      }
      if (fs.existsSync('workspace/it.db~')) {
        fs.unlinkSync('workspace/it.db~~')
      }

      fs.writeFileSync('workspace/it.db~', 'something', 'utf8')

      expect(fs.existsSync('workspace/it.db')).toEqual(false)
      expect(fs.existsSync('workspace/it.db~')).toEqual(true)

      await ensureDatafileIntegrity(p.name)

      expect(fs.existsSync('workspace/it.db')).toEqual(true)
      expect(fs.existsSync('workspace/it.db~')).toEqual(false)

      expect(fs.readFileSync('workspace/it.db', 'utf8'), 'something')
    })

    it('If both temp and current datafiles exist, ensureDatafileIntegrity will use the datafile, as it means that the write of the temp file failed', async function () {
      const theDb = new Collection({
        name: 'workspace/it.db',
        storage: new NodeStorage(),
      })

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

      expect(fs.existsSync('workspace/it.db')).toEqual(true)
      expect(fs.existsSync('workspace/it.db~')).toEqual(true)

      await ensureDatafileIntegrity(theDb.persistence.name)

      expect(fs.existsSync('workspace/it.db')).toEqual(true)
      expect(fs.existsSync('workspace/it.db~')).toEqual(true)
      expect(
        fs.readFileSync('workspace/it.db', 'utf8'),
        '{"_id":"0","hello":"world"}',
      )

      await theDb.loadDatabase()
      const docs = await theDb.find({})

      expect(docs.length).toEqual(1)
      expect(docs[0].hello).toEqual('world')
      expect(fs.existsSync('workspace/it.db')).toEqual(true)
      expect(fs.existsSync('workspace/it.db~')).toEqual(false)
    })

    it('persistCachedDatabase should update the contents of the datafile and leave a clean state', async function () {
      await d.insert({ hello: 'world' })
      const docs = await d.find({})
      expect(docs.length).toEqual(1)

      if (fs.existsSync(testDb)) {
        fs.unlinkSync(testDb)
      }
      if (fs.existsSync(testDb + '~')) {
        fs.unlinkSync(testDb + '~')
      }
      expect(fs.existsSync(testDb)).toEqual(false)

      fs.writeFileSync(testDb + '~', 'something', 'utf8')
      expect(fs.existsSync(testDb + '~')).toEqual(true)

      await d.persistence.persistCachedDatabase()

      const contents = fs.readFileSync(testDb, 'utf8')
      expect(fs.existsSync(testDb)).toEqual(true)
      expect(fs.existsSync(testDb + '~')).toEqual(false)
      assert.match(contents, /^{"hello":"world","_id":"[0-9a-zA-Z]{16}"}\n$/)
    })

    it('After a persistCachedDatabase, there should be no temp or old filename', async function () {
      await d.insert({ hello: 'world' })
      const docs = await d.find({})
      expect(docs.length).toEqual(1)

      if (fs.existsSync(testDb)) {
        fs.unlinkSync(testDb)
      }
      if (fs.existsSync(testDb + '~')) {
        fs.unlinkSync(testDb + '~')
      }
      expect(fs.existsSync(testDb)).toEqual(false)
      expect(fs.existsSync(testDb + '~')).toEqual(false)

      fs.writeFileSync(testDb + '~', 'bloup', 'utf8')

      expect(fs.existsSync(testDb + '~')).toEqual(true)

      await d.persistence.persistCachedDatabase()

      const contents = fs.readFileSync(testDb, 'utf8')
      expect(fs.existsSync(testDb)).toEqual(true)
      expect(fs.existsSync(testDb + '~')).toEqual(false)

      assert.match(
        contents,
        /^{"hello":"world","_id":"[0-9a-zA-Z]{16}"}\n$/,
        'Datafile contents not as expected',
      )
    })

    it('persistCachedDatabase should update the contents of the datafile and leave a clean state even if there is a temp datafile', async () => {
      await d.insert({ hello: 'world' })
      const docs = await d.find({})
      expect(docs.length).toEqual(1)

      if (fs.existsSync(testDb)) {
        fs.unlinkSync(testDb)
      }
      fs.writeFileSync(testDb + '~', 'blabla', 'utf8')
      expect(fs.existsSync(testDb)).toEqual(false)
      expect(fs.existsSync(testDb + '~')).toEqual(true)

      await d.persistence.persistCachedDatabase()

      const contents = fs.readFileSync(testDb, 'utf8')
      expect(fs.existsSync(testDb)).toEqual(true)
      expect(fs.existsSync(testDb + '~')).toEqual(false)
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

      const theDb = new Collection({
        name: dbFile,
        storage: new NodeStorage(),
      })
      await theDb.loadDatabase()

      const contents = fs.readFileSync(dbFile, 'utf8')

      expect(fs.existsSync(dbFile)).toEqual(true)
      expect(fs.existsSync(dbFile + '~')).toEqual(false)

      expect(contents).toEqual('')
    })

    it('Persistence works as expected when everything goes fine', async function () {
      const dbFile = 'workspace/test2.db'

      await ensureFileDoesntExist(dbFile)
      await ensureFileDoesntExist(dbFile + '~')

      const theDb = new Collection({
        name: dbFile,
        storage: new NodeStorage(),
      })

      await theDb.loadDatabase()

      let docs = await theDb.find({})
      assert.isEmpty(docs)

      const doc1 = await theDb.insert({ a: 'hello' })
      const doc2 = await theDb.insert({ a: 'world' })

      docs = await theDb.find({})
      assert.lengthOf(docs, 2)
      expect(find(docs, { _id: doc1._id }).a).toEqual('hello')
      expect(find(docs, { _id: doc2._id }).a).toEqual('world')

      await theDb.loadDatabase()

      docs = await theDb.find({})
      assert.lengthOf(docs, 2)
      expect(find(docs, { _id: doc1._id }).a).toEqual('hello')
      expect(find(docs, { _id: doc2._id }).a).toEqual('world')

      assert.isTrue(fs.existsSync(dbFile))
      assert.isFalse(fs.existsSync(dbFile + '~'))

      const theDb2 = new Collection({
        name: dbFile,
        storage: new NodeStorage(),
      })
      await theDb2.loadDatabase()

      docs = await theDb2.find({})

      assert.lengthOf(docs, 2)
      expect(find(docs, { _id: doc1._id }).a).toEqual('hello')
      expect(find(docs, { _id: doc2._id }).a).toEqual('world')

      assert.isTrue(fs.existsSync(dbFile))
      assert.isFalse(fs.existsSync(dbFile + '~'))
    })
  })

  describe('ensureFileDoesntExist', () => {
    it('Doesnt do anything if file already doesnt exist', async () => {
      await ensureFileDoesntExist('workspace/nonexisting')
      expect(fs.existsSync('workspace/nonexisting')).toEqual(false)
    })

    it('Deletes file if it exists', async () => {
      fs.writeFileSync('workspace/existing', 'hello world', 'utf8')
      expect(fs.existsSync('workspace/existing')).toEqual(true)

      await ensureFileDoesntExist('workspace/existing')
      expect(fs.existsSync('workspace/existing')).toEqual(false)
    })
  })
})

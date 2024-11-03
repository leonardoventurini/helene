import { Collection, createCollection } from '@helenejs/data'
import { CHUNK_SIZE, IDBStorage } from '@helenejs/data/lib/browser'
import { expect } from 'chai'
import { openDB } from 'idb'
import { sleep } from '@helenejs/utils'

type Test = { _id: number; name: string }

describe('Helene Data IDB Storage', function () {
  this.timeout(10000)

  let collection: Collection<Test>
  let storage: IDBStorage
  const DB_NAME = 'helene_data'
  const STORE_NAME = 'chunks'
  const COLLECTION_NAME = 'test'

  async function readRawDataFromIDB(docId: string): Promise<string> {
    const db = await openDB(DB_NAME, 1)
    const chunks = await db.getAllFromIndex(
      STORE_NAME,
      'docId',
      `helene:data:${docId}`,
    )
    if (chunks.length === 0) return '[]'
    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)
    return chunks.map(chunk => chunk.content).join('')
  }

  async function getChunkCount(docId: string): Promise<number> {
    const db = await openDB(DB_NAME, 1)
    const chunks = await db.getAllFromIndex(
      STORE_NAME,
      'docId',
      `helene:data:${docId}`,
    )
    return chunks.length
  }

  beforeEach(async () => {
    Error.stackTraceLimit = Infinity
    storage = new IDBStorage()
    collection = await createCollection<Test>({
      name: COLLECTION_NAME,
      storage,
    })
    await storage.clear()
  })

  afterEach(async () => {
    await storage.clear()
  })

  describe('Basic Operations', () => {
    it('should insert and retrieve single document', async () => {
      const testDoc = { _id: 1, name: 'test_1' }
      await collection.insert(testDoc)
      await sleep(100) // Allow time for storage operations

      const docs = await collection.find({ _id: 1 })
      expect(docs).to.have.length(1)
      expect(docs[0]).to.deep.equal(testDoc)
    })

    it('should persist data across collection instances', async () => {
      const testDoc = { _id: 1, name: 'test_1' }
      await collection.insert(testDoc)
      await sleep(100)

      const collection2 = await createCollection<Test>({
        name: COLLECTION_NAME,
        storage: new IDBStorage(),
        autoload: true,
      })

      const docs = await collection2.find()
      expect(docs).to.have.length(1)
      expect(docs[0]).to.deep.equal(testDoc)
    })
  })

  describe('Storage Implementation', () => {
    it('should properly chunk large datasets', async () => {
      const largeName = 'x'.repeat(CHUNK_SIZE * 2)
      await collection.insert({ _id: 1, name: largeName })
      await sleep(100)

      const chunkCount = await getChunkCount(COLLECTION_NAME)
      expect(chunkCount).to.be.at.least(2)
    })

    it('should handle empty collections', async () => {
      // Don't insert any documents
      await sleep(100)

      const docs = await collection.find()
      expect(docs).to.have.length(0)

      const rawData = await readRawDataFromIDB(COLLECTION_NAME)
      expect(JSON.parse(rawData)).to.deep.equal([])
    })

    it('should handle special characters in data', async () => {
      const specialDoc = { _id: 1, name: '!@#$%^&*()_+{}[]"\'\\' }
      await collection.insert(specialDoc)
      await sleep(100)

      const docs = await collection.find()
      expect(docs[0]).to.deep.equal(specialDoc)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid JSON gracefully', async () => {
      await storage.write(COLLECTION_NAME, '{invalid json')
      await sleep(100)

      try {
        await collection.find()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.exist
      }
    })
  })

  describe('Performance', () => {
    it('should handle rapid consecutive operations', async () => {
      const operations = Array.from({ length: 10 }, (_, i) =>
        collection.insert({ _id: i, name: `test_${i}` }),
      )

      await Promise.all(operations)
      await sleep(100)

      const docs = await collection.find()
      expect(docs).to.have.length(10)
    })

    it('should handle moderate number of documents', async function () {
      const startTime = Date.now()

      for (let i = 0; i < 100; i++) {
        await collection.insert({ _id: i, name: `test_${i}` })
      }

      await sleep(100)

      const endTime = Date.now()
      const duration = endTime - startTime

      const docs = await collection.find()
      expect(docs).to.have.length(100)
      expect(duration).to.be.lessThan(5000)
    })
  })
})

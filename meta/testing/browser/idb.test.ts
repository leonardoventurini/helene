import { Collection, createCollection } from '../../../packages/data/src'
import {
  CHUNK_SIZE,
  IDBStorage,
} from '../../../packages/data/src/browser/idb-storage'
import { expect } from 'chai'
import { openDB } from 'idb'

type Test = { _id: number; name: string }

// Simple delay utility for tests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('Helene Data IDB Storage', function () {
  this.timeout(10000)

  let collection: Collection<Test>
  let storage: IDBStorage
  const DB_NAME = 'helene_data'
  const STORE_NAME = 'chunks'
  let testId: string

  function getUniqueCollectionName(testName: string = 'test'): string {
    return `${testName}_${testId}_${Math.random().toString(36).substr(2, 9)}`
  }

  async function readRawDataFromIDB(
    docId: string,
  ): Promise<{ content: string; compressed?: boolean }[]> {
    const db = await openDB(DB_NAME, 1)
    const chunks = await db.getAllFromIndex(
      STORE_NAME,
      'docId',
      `helene:data:${docId}`,
    )
    if (chunks.length === 0) return []
    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)
    return chunks.map(chunk => ({
      content: chunk.content,
      compressed: chunk.compressed,
    }))
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
    testId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
    storage = new IDBStorage()

    // Clear all data first
    await storage.clear()
  })

  afterEach(async () => {
    // Ensure cleanup
    if (storage) {
      await storage.clear()
    }
  })

  after(async () => {
    // Final cleanup - clear entire database
    try {
      const db = await openDB(DB_NAME, 1)
      await db.clear(STORE_NAME)
      db.close()
    } catch (e) {
      // Ignore cleanup errors
    }
  })

  describe('Basic Operations', () => {
    it('should insert and retrieve single document', async () => {
      const collectionName = getUniqueCollectionName('basic')
      collection = await createCollection<Test>({
        name: collectionName,
        storage,
      })

      const testDoc = { _id: 1, name: 'test_1' }
      await collection.insert(testDoc)
      await storage.flush()

      const docs = await collection.find({ _id: 1 })
      expect(docs).to.have.length(1)
      expect(docs[0]).to.deep.equal(testDoc)
    })

    it('should persist data across collection instances', async () => {
      const collectionName = getUniqueCollectionName('persist')
      collection = await createCollection<Test>({
        name: collectionName,
        storage,
      })

      const testDoc = { _id: 1, name: 'test_1' }
      await collection.insert(testDoc)

      // Force collection to persist all data to storage
      await (collection as any).persistence.compactDatafile()
      await storage.flush()

      // Verify the first collection can find the data
      const docsBeforePersist = await collection.find()
      expect(docsBeforePersist).to.have.length(1)

      // Create a completely new storage instance to test persistence
      const newStorage = new IDBStorage()
      const collection2 = await createCollection<Test>({
        name: collectionName,
        storage: newStorage,
        autoload: true,
      })

      // Give time for autoload to complete
      await delay(200)

      const docs = await collection2.find()
      expect(docs).to.have.length(1)
      expect(docs[0]).to.deep.equal(testDoc)

      // Clean up the new storage instance
      await newStorage.clear()
    })
  })

  describe('Direct Storage Operations', () => {
    it('should handle basic read/write operations', async () => {
      const docName = getUniqueCollectionName('direct')
      await storage.write(docName, 'hello world')
      const result = await storage.read(docName)
      expect(result).to.equal('hello world')
    })

    it('should handle empty reads gracefully', async () => {
      const result = await storage.read(getUniqueCollectionName('nonexistent'))
      expect(result).to.equal('')
    })

    it('should append data correctly', async () => {
      const docName = getUniqueCollectionName('append')
      await storage.write(docName, 'hello')
      await storage.append(docName, ' world')
      await storage.append(docName, '!')

      const result = await storage.read(docName)
      expect(result).to.equal('hello world!')
    })

    it('should handle append to non-existent document', async () => {
      const docName = getUniqueCollectionName('newappend')
      await storage.append(docName, 'first data')
      const result = await storage.read(docName)
      expect(result).to.equal('first data')
    })
  })

  describe('Chunking and Compression', () => {
    it('should properly chunk large datasets', async () => {
      const collectionName = getUniqueCollectionName('chunking')
      collection = await createCollection<Test>({
        name: collectionName,
        storage,
      })

      const largeName = 'x'.repeat(CHUNK_SIZE * 2)
      await collection.insert({ _id: 1, name: largeName })
      await storage.flush()

      const chunkCount = await getChunkCount(collectionName)
      expect(chunkCount).to.be.at.least(2)
    })

    it('should compress large text data', async () => {
      const docName = getUniqueCollectionName('compression')
      const repetitiveText = 'hello world '.repeat(1000) // Should compress well
      await storage.write(docName, repetitiveText)
      await storage.flush()

      const chunks = await readRawDataFromIDB(docName)
      expect(chunks.some(chunk => chunk.compressed)).to.be.true

      const result = await storage.read(docName)
      expect(result).to.equal(repetitiveText)
    })

    it('should not compress small data', async () => {
      const docName = getUniqueCollectionName('nocompression')
      const smallText = 'small data'
      await storage.write(docName, smallText)
      await storage.flush()

      const chunks = await readRawDataFromIDB(docName)
      expect(chunks.every(chunk => !chunk.compressed)).to.be.true

      const result = await storage.read(docName)
      expect(result).to.equal(smallText)
    })

    it('should handle mixed compressed and uncompressed chunks', async () => {
      const docName = getUniqueCollectionName('mixed')
      const mixedData = 'small' + 'x'.repeat(2000) + 'y'.repeat(2000)
      await storage.write(docName, mixedData)
      await storage.flush()

      const result = await storage.read(docName)
      expect(result).to.equal(mixedData)
    })
  })

  describe('Caching Behavior', () => {
    it('should cache read data for faster subsequent access', async () => {
      const docName = getUniqueCollectionName('cache')
      const testData = 'cached data test'
      await storage.write(docName, testData)
      await storage.flush()

      // Clear any existing cache to ensure clean test
      await storage.clear()
      await storage.write(docName, testData)
      await storage.flush()

      // First read - should hit storage
      const start1 = Date.now()
      const result1 = await storage.read(docName)
      const time1 = Date.now() - start1

      // Second read - should hit cache
      const start2 = Date.now()
      const result2 = await storage.read(docName)
      const time2 = Date.now() - start2

      expect(result1).to.equal(testData)
      expect(result2).to.equal(testData)

      // Cache should be faster, but allow for some variance in timing
      console.log(
        `Cache test - First read: ${time1}ms, Second read: ${time2}ms`,
      )
      expect(time2).to.be.lessThan(Math.max(time1, 10)) // At least as fast, with 10ms minimum
    })

    it('should immediately return cached data on write', async () => {
      const docName = getUniqueCollectionName('immediate')
      await storage.write(docName, 'immediate data')

      // Should return immediately from cache without waiting for disk write
      const result = await storage.read(docName)
      expect(result).to.equal('immediate data')
    })
  })

  describe('Batch Writing', () => {
    it('should batch multiple writes efficiently', async () => {
      const start = Date.now()

      // These should be batched together
      const batch1 = getUniqueCollectionName('batch1')
      const batch2 = getUniqueCollectionName('batch2')
      const batch3 = getUniqueCollectionName('batch3')

      await storage.write(batch1, 'data1')
      await storage.write(batch2, 'data2')
      await storage.write(batch3, 'data3')

      // Force flush
      await storage.flush()

      const time = Date.now() - start

      expect(await storage.read(batch1)).to.equal('data1')
      expect(await storage.read(batch2)).to.equal('data2')
      expect(await storage.read(batch3)).to.equal('data3')

      // Should be reasonably fast due to batching
      expect(time).to.be.lessThan(1000)
    })

    it('should handle rapid consecutive writes', async () => {
      const operations = Array.from({ length: 10 }, (_, i) => {
        const docName = getUniqueCollectionName(`rapid_${i}`)
        return storage.write(docName, `data_${i}`).then(() => docName)
      })

      const docNames = await Promise.all(operations)
      await storage.flush()

      // Verify all data was written correctly
      for (let i = 0; i < 10; i++) {
        const result = await storage.read(docNames[i])
        expect(result).to.equal(`data_${i}`)
      }
    })
  })

  describe('Append Performance', () => {
    it('should efficiently append to existing chunks with space', async () => {
      const docName = getUniqueCollectionName('appendeff')
      const initialData = 'x'.repeat(100) // Small initial data
      await storage.write(docName, initialData)
      await storage.flush()

      const initialChunkCount = await getChunkCount(docName)

      // Append more data that should fit in existing chunk
      await storage.append(docName, 'y'.repeat(100))
      await storage.flush()

      const finalChunkCount = await getChunkCount(docName)

      // Should not create new chunks if it fits
      expect(finalChunkCount).to.equal(initialChunkCount)

      const result = await storage.read(docName)
      expect(result).to.equal(initialData + 'y'.repeat(100))
    })

    it('should create new chunks when append exceeds chunk capacity', async () => {
      const docName = getUniqueCollectionName('appendover')
      const initialData = 'x'.repeat(CHUNK_SIZE - 100) // Nearly full chunk
      await storage.write(docName, initialData)
      await storage.flush()

      const initialChunkCount = await getChunkCount(docName)

      // Append data that will overflow to new chunk
      await storage.append(docName, 'y'.repeat(200))
      await storage.flush()

      const finalChunkCount = await getChunkCount(docName)

      // Should create new chunk for overflow
      expect(finalChunkCount).to.be.greaterThan(initialChunkCount)

      const result = await storage.read(docName)
      expect(result).to.equal(initialData + 'y'.repeat(200))
    })
  })

  describe('Collection Integration', () => {
    it('should handle empty collections', async () => {
      const collectionName = getUniqueCollectionName('empty')
      collection = await createCollection<Test>({
        name: collectionName,
        storage,
      })

      await storage.flush()

      const docs = await collection.find()
      expect(docs).to.have.length(0)

      const rawData = await readRawDataFromIDB(collectionName)
      expect(rawData).to.have.length(0)
    })

    it('should handle special characters in data', async () => {
      const collectionName = getUniqueCollectionName('special')
      collection = await createCollection<Test>({
        name: collectionName,
        storage,
      })

      const specialDoc = { _id: 1, name: '!@#$%^&*()_+{}[]"\'\\' }
      await collection.insert(specialDoc)
      await storage.flush()

      const docs = await collection.find()
      expect(docs[0]).to.deep.equal(specialDoc)
    })

    it('should handle rapid consecutive collection operations', async () => {
      const collectionName = getUniqueCollectionName('rapid')
      collection = await createCollection<Test>({
        name: collectionName,
        storage,
      })

      const operations = Array.from({ length: 10 }, (_, i) =>
        collection.insert({ _id: i, name: `test_${i}` }),
      )

      await Promise.all(operations)
      await storage.flush()

      const docs = await collection.find()
      expect(docs).to.have.length(10)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid JSON gracefully', async () => {
      const collectionName = getUniqueCollectionName('invalid')
      collection = await createCollection<Test>({
        name: collectionName,
        storage,
      })

      await storage.write(collectionName, '{invalid json')
      await storage.flush()

      try {
        const docs = await collection.find()
        // If no error is thrown, the find should return empty array for invalid data
        expect(Array.isArray(docs)).to.be.true
      } catch (error) {
        // Should throw a meaningful error for invalid JSON
        expect(error).to.exist
        const errorMessage = error.message || ''
        expect(errorMessage.includes('JSON') || errorMessage.includes('parse'))
          .to.be.true
      }
    })

    it('should handle clear operations correctly', async () => {
      const docName = getUniqueCollectionName('clear')
      await storage.write(docName, 'data')
      await storage.flush()

      expect(await storage.read(docName)).to.equal('data')

      await storage.clear()

      expect(await storage.read(docName)).to.equal('')
    })
  })

  describe('Performance', () => {
    it('should handle moderate number of documents efficiently', async function () {
      const collectionName = getUniqueCollectionName('perf')
      collection = await createCollection<Test>({
        name: collectionName,
        storage,
      })

      const startTime = Date.now()

      for (let i = 0; i < 100; i++) {
        await collection.insert({ _id: i, name: `test_${i}` })
      }

      await storage.flush()

      const endTime = Date.now()
      const duration = endTime - startTime

      const docs = await collection.find()
      expect(docs).to.have.length(100)
      expect(duration).to.be.lessThan(5000) // Should be fast with optimizations
    })

    it('should handle large documents with compression', async () => {
      const collectionName = getUniqueCollectionName('large')
      collection = await createCollection<Test>({
        name: collectionName,
        storage,
      })

      const largeDoc = {
        _id: 1,
        name: 'x'.repeat(10000),
        data: 'y'.repeat(10000),
      }

      const start = Date.now()
      await collection.insert(largeDoc)
      await storage.flush()
      const writeTime = Date.now() - start

      const readStart = Date.now()
      const docs = await collection.find()
      const readTime = Date.now() - readStart

      expect(docs).to.have.length(1)
      expect(docs[0]).to.deep.equal(largeDoc)
      expect(writeTime).to.be.lessThan(2000)
      expect(readTime).to.be.lessThan(1000)
    })
  })
})

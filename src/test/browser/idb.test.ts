import { Collection, createCollection } from '../../data'
import { CHUNK_SIZE, IDBStorage } from '../../data/browser/idb-storage'
import { expect, describe, it, beforeEach, afterEach, afterAll } from 'vitest'
import { openDB } from 'idb'

type Test = { _id: number; name: string }

// Simple delay utility for tests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('Helene Data IDB Storage', () => {
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

  afterAll(async () => {
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

      // Force collection to persist data to storage
      await (collection as any).persistence.compactDatafile()
      await storage.flush()

      const chunkCount = await getChunkCount(collectionName)
      expect(chunkCount).to.be.at.least(2)
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
    it('should handle moderate number of documents efficiently', async () => {
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

  describe('Data Integrity Over Multiple Cycles', () => {
    it('should maintain data integrity over repeated write/read cycles', async () => {
      const docName = getUniqueCollectionName('integrity_cycles')
      const originalData = 'hello world '.repeat(500) // Compressible data

      await storage.write(docName, originalData)
      await storage.flush()

      for (let cycle = 0; cycle < 10; cycle++) {
        const readData = await storage.read(docName)
        expect(readData).to.equal(
          originalData,
          `Data corrupted on cycle ${cycle}`,
        )

        await storage.write(docName, readData)
        await storage.flush()

        const verifyData = await storage.read(docName)
        expect(verifyData).to.equal(
          originalData,
          `Data corrupted after rewrite on cycle ${cycle}`,
        )
      }
    })

    it('should maintain integrity with mixed compressed and uncompressed data', async () => {
      const testCases = [
        { name: 'small', data: 'small data' }, // Won't compress
        { name: 'large', data: 'repeated text '.repeat(200) }, // Will compress
        { name: 'json', data: JSON.stringify({ key: 'value'.repeat(100) }) }, // JSON data
        { name: 'special', data: '!@#$%^&*()_+{}[]"\'\\'.repeat(50) }, // Special chars
      ]

      for (const testCase of testCases) {
        const docName = getUniqueCollectionName(`integrity_${testCase.name}`)

        for (let cycle = 0; cycle < 5; cycle++) {
          await storage.write(docName, testCase.data)
          await storage.flush()

          const readData = await storage.read(docName)
          expect(readData).to.equal(
            testCase.data,
            `${testCase.name} data corrupted on cycle ${cycle}`,
          )
        }
      }
    })

    it('should maintain integrity across storage instance recreations', async () => {
      const docName = getUniqueCollectionName('integrity_instances')
      const testData = 'persistent data '.repeat(300)

      for (let cycle = 0; cycle < 5; cycle++) {
        const tempStorage = new IDBStorage()

        if (cycle === 0) {
          await tempStorage.write(docName, testData)
        }

        await tempStorage.flush()
        const readData = await tempStorage.read(docName)

        expect(readData).to.equal(
          testData,
          `Data corrupted on storage recreation cycle ${cycle}`,
        )

        await tempStorage.write(docName, testData)
        await tempStorage.flush()

        // Don't clear the temp storage to test persistence
      }
    })

    it('should handle rapid successive operations without corruption', async () => {
      const docName = getUniqueCollectionName('integrity_rapid')
      const baseData = 'rapid test data '

      for (let batch = 0; batch < 5; batch++) {
        const operations = []

        for (let i = 0; i < 20; i++) {
          const data = baseData.repeat(i + 1)
          operations.push(storage.write(docName, data))
        }

        await Promise.all(operations)
        await storage.flush()

        const finalData = await storage.read(docName)
        expect(finalData).to.include(
          baseData,
          `Data corrupted in rapid operations batch ${batch}`,
        )
      }
    })

    it('should maintain integrity during append operations over multiple cycles', async () => {
      const docName = getUniqueCollectionName('integrity_append')
      const chunkData = 'chunk data '.repeat(100)
      let expectedData = ''

      for (let cycle = 0; cycle < 10; cycle++) {
        await storage.append(docName, chunkData)
        expectedData += chunkData

        await storage.flush()

        const readData = await storage.read(docName)
        expect(readData).to.equal(
          expectedData,
          `Append data corrupted on cycle ${cycle}`,
        )

        expect(readData.length).to.equal(
          expectedData.length,
          `Data length mismatch on cycle ${cycle}`,
        )
      }
    })

    it('should detect and handle compression round-trip corruption', async () => {
      const docName = getUniqueCollectionName('integrity_compression')

      const testCases = [
        'unicode: 你好世界 🌍 émojis 🎉',
        'binary-like: \x00\x01\x02\x03\xFF',
        'newlines:\nline1\nline2\r\nline3\n',
        'tabs and spaces:\t  \t  mixed whitespace',
        'quotes: "double" \'single\' `backtick`',
        'json: {"nested": {"deep": {"value": "test"}}}',
      ]

      for (const testData of testCases) {
        const largifiedData = testData.repeat(200) // Make it large enough to compress

        for (let cycle = 0; cycle < 3; cycle++) {
          await storage.write(docName, largifiedData)
          await storage.flush()

          const readData = await storage.read(docName)
          expect(readData).to.equal(
            largifiedData,
            `Compression round-trip failed for: ${testData.substring(
              0,
              20,
            )}... on cycle ${cycle}`,
          )
        }
      }
    })

    it('should maintain integrity under concurrent read/write stress', async () => {
      const docNames = Array.from({ length: 5 }, (_, i) =>
        getUniqueCollectionName(`integrity_stress_${i}`),
      )
      const testData = 'stress test data '.repeat(100)

      for (let round = 0; round < 3; round++) {
        const writeOps = []
        const readOps = []

        // Start all writes
        for (const docName of docNames) {
          writeOps.push(storage.write(docName, testData + round))
        }

        // Start concurrent reads - they might read old or new data during transition
        for (const docName of docNames) {
          readOps.push(
            storage.read(docName).then(data => {
              // During concurrent operations, we might read:
              // - Empty string (if never written)
              // - Previous round data (if not yet updated)
              // - Current round data (if already updated)
              const validData = [
                '', // Empty
                testData + (round - 1), // Previous round
                testData + round, // Current round
              ]

              if (round === 0) {
                // First round can only be empty or current
                expect(['', testData + round]).to.include(data)
              } else {
                // Later rounds can be any of the valid states
                expect(validData).to.include(
                  data,
                  `Invalid concurrent read data: ${data?.substring(0, 50)}...`,
                )
              }
            }),
          )
        }

        await Promise.all([...writeOps, ...readOps])
        await storage.flush()

        // After flush, all data should be consistent
        for (const docName of docNames) {
          const finalData = await storage.read(docName)
          expect(finalData).to.equal(
            testData + round,
            `Stress test corrupted data for ${docName} in round ${round}`,
          )
        }
      }
    })

    it('should verify chunk boundary integrity over multiple operations', async () => {
      const docName = getUniqueCollectionName('integrity_chunks')

      const chunk1 = 'A'.repeat(CHUNK_SIZE - 100)
      const chunk2 = 'B'.repeat(200) // This will overflow to new chunk
      const chunk3 = 'C'.repeat(CHUNK_SIZE)

      await storage.write(docName, chunk1)
      await storage.flush()

      for (let cycle = 0; cycle < 5; cycle++) {
        await storage.append(docName, chunk2)
        await storage.flush()

        const readData = await storage.read(docName)
        const expectedLength = chunk1.length + chunk2.length * (cycle + 1)
        expect(readData.length).to.equal(
          expectedLength,
          `Chunk boundary corruption on cycle ${cycle}`,
        )

        expect(readData.startsWith(chunk1)).to.be.true
        expect(readData.includes(chunk2)).to.be.true
      }

      await storage.append(docName, chunk3)
      await storage.flush()

      const finalData = await storage.read(docName)
      expect(finalData.endsWith(chunk3)).to.be.true
      expect(finalData.startsWith(chunk1)).to.be.true
    })

    it('should maintain data consistency during cache eviction cycles', async () => {
      const docNames = Array.from({ length: 60 }, (_, i) =>
        getUniqueCollectionName(`integrity_cache_${i}`),
      ) // More than cache size to force eviction

      const testData = 'cache eviction test '.repeat(50)

      for (let cycle = 0; cycle < 3; cycle++) {
        for (const docName of docNames) {
          await storage.write(docName, testData + cycle)
        }
        await storage.flush()

        for (const docName of docNames) {
          const readData = await storage.read(docName)
          expect(readData).to.equal(
            testData + cycle,
            `Cache eviction corrupted data for ${docName} in cycle ${cycle}`,
          )
        }
      }
    })

    it('should verify data integrity after simulated power loss scenarios', async () => {
      const docName = getUniqueCollectionName('integrity_power_loss')
      const testData = 'power loss test '.repeat(200)

      for (let cycle = 0; cycle < 5; cycle++) {
        await storage.write(docName, testData + cycle)

        if (cycle % 2 === 0) {
          await storage.flush()
        }

        const readData = await storage.read(docName)
        expect(readData).to.equal(
          testData + cycle,
          `Power loss simulation corrupted data on cycle ${cycle}`,
        )

        const tempStorage = new IDBStorage()
        const persistedData = await tempStorage.read(docName)

        if (cycle % 2 === 0) {
          expect(persistedData).to.equal(
            testData + cycle,
            `Persisted data corrupted on flushed cycle ${cycle}`,
          )
        }
      }
    })
  })
})

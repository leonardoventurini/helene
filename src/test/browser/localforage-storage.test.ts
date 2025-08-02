import { LocalForageStorage } from '../../data/browser/localforage-storage'
import { createCollection } from '../../data'
import { expect, describe, it, beforeEach, afterEach, afterAll } from 'vitest'
import localforage from 'localforage'

type Test = { _id: number; name: string }

// Simple delay utility for tests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('LocalForage BrowserStorage', () => {
  let storage: LocalForageStorage
  let testId: string

  function getUniqueCollectionName(testName: string = 'test'): string {
    return `${testName}_${testId}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Helper to access internal cache for testing
  function getCache() {
    return (storage as any).cache
  }

  // Helper to manually trigger debounced flush
  async function triggerFlush(name: string) {
    await (storage as any).flush(name)
  }

  beforeEach(async () => {
    Error.stackTraceLimit = Infinity
    testId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
    storage = new LocalForageStorage()

    // Clear all LocalForage instances
    await localforage.clear()
    const metadataDB = localforage.createInstance({
      name: 'helene-metadata',
      driver: localforage.INDEXEDDB,
    })
    const chunksDB = localforage.createInstance({
      name: 'helene-chunks',
      driver: localforage.INDEXEDDB,
    })
    await metadataDB.clear()
    await chunksDB.clear()
  })

  afterEach(async () => {
    // Clear all data
    if (storage) {
      getCache().clear()
    }
    await localforage.clear()
  })

  afterAll(async () => {
    // Final cleanup
    await localforage.clear()
  })

  describe('Basic Operations', () => {
    it('should read empty string for non-existent document', async () => {
      const result = await storage.read(getUniqueCollectionName('nonexistent'))
      expect(result).to.equal('')
    })

    it('should write and read simple data', async () => {
      const docName = getUniqueCollectionName('simple')
      const testData = 'hello world'

      await storage.write(docName, testData)
      await storage.flush(docName)

      const result = await storage.read(docName)

      expect(result).to.equal(testData)
    })

    it('should append data to existing document', async () => {
      const docName = getUniqueCollectionName('append')

      await storage.write(docName, 'hello')
      await storage.append(docName, ' world')
      await storage.append(docName, '!')

      await storage.flush(docName)

      const result = await storage.read(docName)

      expect(result).to.equal('hello world!')
    })

    it('should append to non-existent document', async () => {
      const docName = getUniqueCollectionName('newappend')

      await storage.append(docName, 'first data')
      await storage.flush(docName)

      const result = await storage.read(docName)

      expect(result).to.equal('first data')
    })

    it('should handle empty string writes', async () => {
      const docName = getUniqueCollectionName('empty')

      await storage.write(docName, '')
      const result = await storage.read(docName)

      expect(result).to.equal('')
    })

    it('should overwrite existing data with write', async () => {
      const docName = getUniqueCollectionName('overwrite')

      await storage.write(docName, 'initial data')
      await storage.write(docName, 'new data')

      await storage.flush(docName)

      const result = await storage.read(docName)
      expect(result).to.equal('new data')
    })
  })

  describe('Caching Behavior', () => {
    it('should cache data after read operations', async () => {
      const docName = getUniqueCollectionName('cache')
      const testData = 'cached data'

      await storage.write(docName, testData)
      await triggerFlush(docName)

      // Clear cache to ensure clean test
      getCache().clear()

      // First read should populate cache
      await storage.read(docName)
      const cache = getCache()

      expect(cache.has(docName)).to.be.true
      expect(cache.get(docName).content).to.equal(testData)
    })

    it('should use cached data for subsequent reads', async () => {
      const docName = getUniqueCollectionName('cached_reads')
      const testData = 'test data for caching'

      await storage.write(docName, testData)
      await triggerFlush(docName)

      // First read
      const start1 = Date.now()
      const result1 = await storage.read(docName)
      const time1 = Date.now() - start1

      // Second read (should use cache)
      const start2 = Date.now()
      const result2 = await storage.read(docName)
      const time2 = Date.now() - start2

      expect(result1).to.equal(testData)
      expect(result2).to.equal(testData)
      expect(time2).to.be.lessThanOrEqual(time1) // Cache should be faster or equal
    })

    it('should update cache on write operations', async () => {
      const docName = getUniqueCollectionName('cache_write')
      const initialData = 'initial'
      const newData = 'updated'

      await storage.write(docName, initialData)
      await storage.write(docName, newData)

      const cache = getCache()
      expect(cache.get(docName).content).to.equal(newData)
    })

    it('should update cache on append operations', async () => {
      const docName = getUniqueCollectionName('cache_append')

      await storage.write(docName, 'hello')
      await storage.append(docName, ' world')

      const cache = getCache()
      expect(cache.get(docName).content).to.equal('hello world')
    })
  })

  describe('Chunking Behavior', () => {
    it('should handle small data without chunking', async () => {
      const docName = getUniqueCollectionName('small')
      const smallData = 'small data'

      await storage.write(docName, smallData)
      await triggerFlush(docName)

      const result = await storage.read(docName)
      expect(result).to.equal(smallData)
    })

    it('should chunk large data properly', async () => {
      const docName = getUniqueCollectionName('large')
      const largeData = 'x'.repeat(3000) // Larger than default chunk size (1024)

      await storage.write(docName, largeData)
      await triggerFlush(docName)

      const result = await storage.read(docName)
      expect(result).to.equal(largeData)
      expect(result.length).to.equal(3000)
    })

    it('should handle very large data with multiple chunks', async () => {
      const docName = getUniqueCollectionName('verylarge')
      const veryLargeData = 'abcdefghij'.repeat(1000) // 10KB data

      await storage.write(docName, veryLargeData)
      await triggerFlush(docName)

      const result = await storage.read(docName)
      expect(result).to.equal(veryLargeData)
      expect(result.length).to.equal(10000)
    })

    it('should maintain chunk order for reassembly', async () => {
      const docName = getUniqueCollectionName('order')
      const orderedData = Array.from({ length: 100 }, (_, i) =>
        i.toString().padStart(3, '0'),
      ).join('')

      await storage.write(docName, orderedData)
      await triggerFlush(docName)

      const result = await storage.read(docName)
      expect(result).to.equal(orderedData)

      // Verify the data still contains ordered sequence
      expect(result).to.include('000001002')
      expect(result).to.include('097098099')
    })
  })

  describe('Debounced Flushing', () => {
    it('should not immediately flush writes to storage', async () => {
      const docName = getUniqueCollectionName('debounce')
      const testData = 'debounced data'

      await storage.write(docName, testData)

      // Data should be in cache but not yet persisted
      const cache = getCache()
      expect(cache.get(docName).content).to.equal(testData)

      // Clear cache and try to read - should get empty since not flushed
      cache.clear()
      const result = await storage.read(docName)
      expect(result).to.equal('') // No data in storage yet
    })

    it('should flush after debounce delay', async () => {
      const docName = getUniqueCollectionName('auto_flush')
      const testData = 'auto flush data'

      await storage.write(docName, testData)

      // Wait for debounce delay (1000ms + buffer)
      await delay(1200)

      // Clear cache and read - should get data from storage
      getCache().clear()
      const result = await storage.read(docName)
      expect(result).to.equal(testData)
    })

    it('should handle multiple rapid writes with debouncing', async () => {
      const docName = getUniqueCollectionName('rapid')

      await storage.write(docName, 'write1')
      await storage.write(docName, 'write2')
      await storage.write(docName, 'write3')

      // Should only have the latest value in cache
      const cache = getCache()
      expect(cache.get(docName).content).to.equal('write3')

      // Wait for flush
      await delay(1200)

      // Verify final data persisted
      getCache().clear()
      const result = await storage.read(docName)
      expect(result).to.equal('write3')
    })
  })

  describe('Data Integrity', () => {
    it('should handle special characters correctly', async () => {
      const docName = getUniqueCollectionName('special')
      const specialData = '!@#$%^&*()_+{}[]"\'\\|`~\n\t\r'

      await storage.write(docName, specialData)
      await triggerFlush(docName)

      const result = await storage.read(docName)
      expect(result).to.equal(specialData)
    })

    it('should handle unicode characters', async () => {
      const docName = getUniqueCollectionName('unicode')
      const unicodeData = '你好世界 🌍 émojis 🎉 Ñandú'

      await storage.write(docName, unicodeData)
      await triggerFlush(docName)

      const result = await storage.read(docName)
      expect(result).to.equal(unicodeData)
    })

    it('should handle JSON data correctly', async () => {
      const docName = getUniqueCollectionName('json')
      const jsonData = JSON.stringify({
        name: 'test',
        nested: { value: 123 },
        array: [1, 2, 3],
        special: 'chars: "quotes" \'apostrophes\'',
      })

      await storage.write(docName, jsonData)
      await triggerFlush(docName)

      const result = await storage.read(docName)
      expect(result).to.equal(jsonData)

      // Verify it's still valid JSON
      const parsed = JSON.parse(result)
      expect(parsed.name).to.equal('test')
      expect(parsed.nested.value).to.equal(123)
    })

    it('should maintain data integrity across multiple write/read cycles', async () => {
      const docName = getUniqueCollectionName('integrity')
      const originalData = 'integrity test data '.repeat(100)

      for (let cycle = 0; cycle < 5; cycle++) {
        await storage.write(docName, originalData + cycle)
        await triggerFlush(docName)

        const readData = await storage.read(docName)
        expect(readData).to.equal(originalData + cycle, `Cycle ${cycle} failed`)
      }
    })

    it('should handle concurrent operations correctly', async () => {
      const docNames = Array.from({ length: 5 }, (_, i) =>
        getUniqueCollectionName(`concurrent_${i}`),
      )

      const operations = docNames.map((name, i) =>
        storage.write(name, `data_${i}`),
      )

      await Promise.all(operations)

      for (const name of docNames) {
        await storage.flush(name)
      }

      // Verify all data was written correctly
      for (let i = 0; i < docNames.length; i++) {
        const result = await storage.read(docNames[i])
        expect(result).to.equal(`data_${i}`)
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed metadata gracefully', async () => {
      const docName = getUniqueCollectionName('malformed')

      // Manually insert malformed metadata
      const metadataDB = localforage.createInstance({
        name: 'helene-metadata',
        driver: localforage.INDEXEDDB,
      })

      await metadataDB.setItem(docName, { invalidStructure: true })

      // Should handle gracefully and return empty string
      const result = await storage.read(docName)
      expect(result).to.equal('')
    })

    it('should handle missing chunks gracefully', async () => {
      const docName = getUniqueCollectionName('missing_chunks')

      // Create metadata pointing to non-existent chunks
      const metadataDB = localforage.createInstance({
        name: 'helene-metadata',
        driver: localforage.INDEXEDDB,
      })

      await metadataDB.setItem(docName, {
        chunkIds: ['nonexistent-chunk-1', 'nonexistent-chunk-2'],
      })

      // Should handle gracefully
      const result = await storage.read(docName)
      expect(result).to.equal('')
    })
  })

  describe('Persistence Across Storage Instances', () => {
    it('should persist data across different storage instances', async () => {
      const docName = getUniqueCollectionName('persist')
      const testData = 'persistent data'

      // Write with first instance
      await storage.write(docName, testData)
      await triggerFlush(docName)

      // Create new storage instance and read
      const newStorage = new LocalForageStorage()
      const result = await newStorage.read(docName)

      expect(result).to.equal(testData)
    })

    it('should handle data written by different storage instances', async () => {
      const docName = getUniqueCollectionName('multi_instance')

      const storage1 = new LocalForageStorage()
      const storage2 = new LocalForageStorage()

      await storage1.write(docName, 'data from storage1')
      await storage1.flush(docName)

      await storage2.append(docName, ' and storage2')
      await storage2.flush(docName)

      const result = await storage1.read(docName)

      expect(result).to.equal('data from storage1 and storage2')
    })
  })

  describe('Collection Integration', () => {
    it('should work with Helene collections', async () => {
      const collectionName = getUniqueCollectionName('collection')
      const collection = await createCollection<Test>({
        name: collectionName,
        storage,
      })

      const testDoc = { _id: 1, name: 'collection_test' }
      await collection.insert(testDoc)

      // Force flush
      await triggerFlush(collectionName)

      const docs = await collection.find({ _id: 1 })
      expect(docs).to.have.length(1)
      expect(docs[0]).to.deep.equal(testDoc)
    })

    it('should persist collection data across instances', async () => {
      const collectionName = getUniqueCollectionName('persist_collection')

      // Create collection with first storage instance
      const collection1 = await createCollection<Test>({
        name: collectionName,
        storage,
      })

      const testDoc = { _id: 1, name: 'persistent_test' }
      await collection1.insert(testDoc)

      // Force persistence
      await (collection1 as any).persistence.compactDatafile()
      await triggerFlush(collectionName)

      // Create new collection with new storage instance
      const newStorage = new LocalForageStorage()
      const collection2 = await createCollection<Test>({
        name: collectionName,
        storage: newStorage,
        autoload: true,
      })

      // Give time for autoload
      await delay(200)

      const docs = await collection2.find()
      expect(docs).to.have.length(1)
      expect(docs[0]).to.deep.equal(testDoc)
    })

    it('should handle large collections efficiently', async () => {
      const collectionName = getUniqueCollectionName('large_collection')
      const collection = await createCollection<Test>({
        name: collectionName,
        storage,
      })

      const startTime = Date.now()

      // Insert many documents
      for (let i = 0; i < 100; i++) {
        await collection.insert({ _id: i, name: `test_${i}` })
      }

      await triggerFlush(collectionName)

      const endTime = Date.now()
      const duration = endTime - startTime

      const docs = await collection.find()
      expect(docs).to.have.length(100)
      expect(duration).to.be.lessThan(5000) // Should be reasonably fast
    })
  })

  describe('Memory Management', () => {
    it('should not leak memory with many operations', async () => {
      const initialCacheSize = getCache().size

      // Perform many operations
      for (let i = 0; i < 50; i++) {
        const docName = getUniqueCollectionName(`memory_${i}`)
        await storage.write(docName, `data_${i}`)
      }

      const finalCacheSize = getCache().size

      // Cache should grow but not excessively
      expect(finalCacheSize).to.be.greaterThan(initialCacheSize)
      expect(finalCacheSize).to.be.lessThan(100) // Reasonable limit
    })
  })

  describe('Performance', () => {
    it('should handle rapid consecutive operations efficiently', async () => {
      const startTime = Date.now()

      const operations = Array.from({ length: 20 }, (_, i) => {
        const docName = getUniqueCollectionName(`perf_${i}`)
        return storage.write(docName, `performance_data_${i}`)
      })

      await Promise.all(operations)

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(duration).to.be.lessThan(1000) // Should complete quickly
    })

    it('should efficiently handle mixed read/write operations', async () => {
      const docNames = Array.from({ length: 10 }, (_, i) =>
        getUniqueCollectionName(`mixed_${i}`),
      )

      // Initial writes
      for (const name of docNames) {
        await storage.write(name, 'initial data')
      }

      const startTime = Date.now()

      // Mixed operations
      const operations: Promise<any>[] = []
      for (const name of docNames) {
        operations.push(storage.read(name))
        operations.push(storage.append(name, ' appended'))
        operations.push(storage.read(name))
      }

      await Promise.all(operations)

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(duration).to.be.lessThan(500) // Should be fast due to caching
    })
  })
})

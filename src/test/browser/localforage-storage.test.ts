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
    // Helper to access internal DBs for testing
    const getMetadataDB = () =>
      localforage.createInstance({
        name: 'helene-metadata',
        driver: localforage.INDEXEDDB,
      })

    const getChunksDB = () =>
      localforage.createInstance({
        name: 'helene-chunks',
        driver: localforage.INDEXEDDB,
      })

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
      const veryLargeData = 'abcdefghij'.repeat(100000) // 1MB data (larger than 512KB chunk size)

      await storage.write(docName, veryLargeData)
      await triggerFlush(docName)

      const result = await storage.read(docName)
      expect(result).to.equal(veryLargeData)
      expect(result.length).to.equal(1000000)

      // Verify chunks were actually created
      const metadata = (await getMetadataDB().getItem(docName)) as any
      expect(metadata.chunkIds).to.have.length(2) // Should have 2 chunks for 1MB data with 512KB chunk size
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

    it('should store chunks with correct structure in ChunksDB', async () => {
      const docName = getUniqueCollectionName('chunk_structure')
      const testData = 'a'.repeat(600 * 1024) // 600KB to ensure we get 2 chunks

      await storage.write(docName, testData)
      await triggerFlush(docName)

      const metadata = (await getMetadataDB().getItem(docName)) as any
      expect(metadata).to.have.property('chunkIds')
      expect(metadata.chunkIds).to.have.length(2)

      // Verify each chunk is stored correctly
      const chunksDB = getChunksDB()
      for (const chunkId of metadata.chunkIds) {
        const chunk = (await chunksDB.getItem(chunkId)) as any
        expect(chunk).to.not.be.null
        expect(chunk).to.have.property('id', chunkId)
        expect(chunk).to.have.property('content')
        expect(chunk.content).to.be.a('string') // Should be compressed string
      }
    })

    it('should delete old chunks when data is replaced', async () => {
      const docName = getUniqueCollectionName('chunk_deletion')
      const chunksDB = getChunksDB()

      // Write initial large data
      const initialData = 'initial'.repeat(100000) // ~700KB
      await storage.write(docName, initialData)
      await triggerFlush(docName)

      const initialMetadata = (await getMetadataDB().getItem(docName)) as any
      const initialChunkIds = initialMetadata.chunkIds
      expect(initialChunkIds).to.have.length(2)

      // Verify initial chunks exist
      for (const chunkId of initialChunkIds) {
        const chunk = await chunksDB.getItem(chunkId)
        expect(chunk).to.not.be.null
      }

      // Replace with different data
      const newData = 'replacement'.repeat(50000) // ~550KB
      await storage.write(docName, newData)
      await triggerFlush(docName)

      const newMetadata = (await getMetadataDB().getItem(docName)) as any
      const newChunkIds = newMetadata.chunkIds
      expect(newChunkIds).to.have.length(2)

      // Verify old chunks were deleted
      for (const oldChunkId of initialChunkIds) {
        if (!newChunkIds.includes(oldChunkId)) {
          const oldChunk = await chunksDB.getItem(oldChunkId)
          expect(oldChunk).to.be.null
        }
      }

      // Verify new chunks exist
      for (const newChunkId of newChunkIds) {
        const chunk = await chunksDB.getItem(newChunkId)
        expect(chunk).to.not.be.null
      }
    })

    it('should reuse identical chunks (deduplication)', async () => {
      const docName1 = getUniqueCollectionName('dedup1')
      const docName2 = getUniqueCollectionName('dedup2')
      const chunksDB = getChunksDB()

      // Create data that will produce identical chunks
      const repeatedPattern = 'x'.repeat(512 * 1024) // Exactly one chunk size
      const data1 = repeatedPattern + 'unique1'
      const data2 = repeatedPattern + 'unique2'

      // Write first document
      await storage.write(docName1, data1)
      await triggerFlush(docName1)

      // Write second document
      await storage.write(docName2, data2)
      await triggerFlush(docName2)

      // Get metadata for both
      const metadata1 = (await getMetadataDB().getItem(docName1)) as any
      const metadata2 = (await getMetadataDB().getItem(docName2)) as any

      // First chunk should be identical (same SHA256 hash)
      expect(metadata1.chunkIds[0]).to.equal(metadata2.chunkIds[0])

      // Second chunks should be different
      expect(metadata1.chunkIds[1]).to.not.equal(metadata2.chunkIds[1])

      // Verify shared chunk exists
      const sharedChunk = await chunksDB.getItem(metadata1.chunkIds[0])
      expect(sharedChunk).to.not.be.null
    })

    it('should handle exact chunk size boundaries', async () => {
      const docName = getUniqueCollectionName('exact_boundary')
      const chunkSize = 512 * 1024

      // Test exact chunk size
      const exactSizeData = 'a'.repeat(chunkSize)
      await storage.write(docName, exactSizeData)
      await triggerFlush(docName)

      const metadata1 = (await getMetadataDB().getItem(docName)) as any
      expect(metadata1.chunkIds).to.have.length(1)

      // Test one byte over chunk size
      const overSizeData = 'a'.repeat(chunkSize + 1)
      await storage.write(docName, overSizeData)
      await triggerFlush(docName)

      const metadata2 = (await getMetadataDB().getItem(docName)) as any
      expect(metadata2.chunkIds).to.have.length(2)

      // Verify data integrity
      const result = await storage.read(docName)
      expect(result).to.equal(overSizeData)
    })

    it('should handle empty data', async () => {
      const docName = getUniqueCollectionName('empty')

      await storage.write(docName, '')
      await triggerFlush(docName)

      const metadata = (await getMetadataDB().getItem(docName)) as any
      expect(metadata.chunkIds).to.have.length(0)

      const result = await storage.read(docName)
      expect(result).to.equal('')
    })

    it('should properly compress and decompress chunks', async () => {
      const docName = getUniqueCollectionName('compression')
      const chunksDB = getChunksDB()

      // Use highly compressible data
      const compressibleData = 'aaaaaaaaaa'.repeat(60000) // 600KB of repeated 'a'

      await storage.write(docName, compressibleData)
      await triggerFlush(docName)

      const metadata = (await getMetadataDB().getItem(docName)) as any

      // Check that chunks are compressed
      for (const chunkId of metadata.chunkIds) {
        const chunk = (await chunksDB.getItem(chunkId)) as any
        // Compressed content should be much smaller than original
        expect(chunk.content.length).to.be.lessThan(100000) // Should compress well
      }

      // Verify decompression works correctly
      const result = await storage.read(docName)
      expect(result).to.equal(compressibleData)
    })

    it('should generate consistent SHA256 hashes for chunk IDs', async () => {
      const docName1 = getUniqueCollectionName('sha1')
      const docName2 = getUniqueCollectionName('sha2')

      // Same content should produce same chunk IDs
      const testData = 'consistent data for hashing'

      await storage.write(docName1, testData)
      await triggerFlush(docName1)

      await storage.write(docName2, testData)
      await triggerFlush(docName2)

      const metadata1 = (await getMetadataDB().getItem(docName1)) as any
      const metadata2 = (await getMetadataDB().getItem(docName2)) as any

      // Same content should have same chunk IDs
      expect(metadata1.chunkIds).to.deep.equal(metadata2.chunkIds)
    })

    it('should handle Unicode and special characters in chunks', async () => {
      const docName = getUniqueCollectionName('unicode')

      // Create data with various Unicode characters that spans multiple chunks
      // Note: chunking is done by string length, not byte length
      const unicodePattern = '🎉émøjī UTF-8 테스트 文字 §¶•'
      const repeats = Math.ceil((512 * 1024 + 100) / unicodePattern.length) // Ensure we exceed chunk size
      const unicodeData = unicodePattern.repeat(repeats)

      await storage.write(docName, unicodeData)
      await triggerFlush(docName)

      const result = await storage.read(docName)
      expect(result).to.equal(unicodeData)

      // Verify chunks were created and Unicode data is preserved
      const metadata = (await getMetadataDB().getItem(docName)) as any
      expect(metadata.chunkIds.length).to.be.greaterThan(0)

      // Verify the data contains Unicode characters
      expect(result).to.include('🎉')
      expect(result).to.include('émøjī')
      expect(result).to.include('테스트')
      expect(result).to.include('文字')
    })

    it('should handle concurrent writes to same document', async () => {
      const docName = getUniqueCollectionName('concurrent')

      // Simulate concurrent writes
      const write1 = storage.write(docName, 'write1'.repeat(100000))
      const write2 = storage.write(docName, 'write2'.repeat(100000))

      await Promise.all([write1, write2])
      await triggerFlush(docName)

      const result = await storage.read(docName)
      // Should have the last write
      expect(result).to.equal('write2'.repeat(100000))
    })

    it('should clean up chunks when document is overwritten with empty string', async () => {
      const docName = getUniqueCollectionName('cleanup')
      const chunksDB = getChunksDB()

      // Write initial data
      const initialData = 'data'.repeat(200000) // ~800KB
      await storage.write(docName, initialData)
      await triggerFlush(docName)

      const initialMetadata = (await getMetadataDB().getItem(docName)) as any
      const initialChunkIds = initialMetadata.chunkIds
      expect(initialChunkIds.length).to.be.greaterThan(0)

      // Overwrite with empty string
      await storage.write(docName, '')
      await triggerFlush(docName)

      // Verify all old chunks were deleted
      for (const chunkId of initialChunkIds) {
        const chunk = await chunksDB.getItem(chunkId)
        expect(chunk).to.be.null
      }

      // Verify metadata has no chunks
      const newMetadata = (await getMetadataDB().getItem(docName)) as any
      expect(newMetadata.chunkIds).to.have.length(0)
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

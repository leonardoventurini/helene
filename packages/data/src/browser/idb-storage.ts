import { IStorage } from '../types'
import { IDBPDatabase, openDB } from 'idb'

export const CHUNK_SIZE = 512 * 1024 // 512 KB
export const STORE_NAME = 'chunks'
export const DB_NAME = 'helene_data'
export const DB_VERSION = 1

interface ChunkData {
  id: string
  docId: string
  chunkIndex: number
  content: string
}

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
    store.createIndex('docId', 'docId')
  },
})

export class IDBStorage implements IStorage {
  private readonly prefix = 'helene:data:'
  private db: IDBPDatabase | null = null

  private async getDB(): Promise<IDBPDatabase> {
    if (!this.db) {
      this.db = await dbPromise
    }
    return this.db
  }

  async read(name: string): Promise<string> {
    try {
      const docId = `${this.prefix}${name}`
      const db = await this.getDB()

      const chunks = await db.getAllFromIndex(STORE_NAME, 'docId', docId)

      if (!chunks.length) {
        return ''
      }

      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)

      return chunks.map(chunk => chunk.content).join('')
    } catch (error) {
      console.error('Error reading from IndexedDB:', error)
      throw new Error('Failed to read data from storage')
    }
  }

  async write(name: string, data: string): Promise<void> {
    try {
      const docId = `${this.prefix}${name}`
      const db = await this.getDB()

      // Split into chunks
      const chunks: string[] = []
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        chunks.push(data.slice(i, i + CHUNK_SIZE))
      }

      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)

      // Delete existing chunks first
      const existingChunks = await store.index('docId').getAllKeys(docId)
      await Promise.all(existingChunks.map(key => store.delete(key)))

      // Write new chunks
      await Promise.all(
        chunks.map((chunk, i) =>
          store.put({
            id: `${docId}-${i}`,
            docId,
            chunkIndex: i,
            content: chunk,
          } as ChunkData),
        ),
      )

      await tx.done
    } catch (error) {
      console.error('Error writing to IndexedDB:', error)
      throw new Error('Failed to write data to storage')
    }
  }

  async append(name: string, data: string): Promise<void> {
    try {
      const existingData = await this.read(name)
      const newData = existingData + data
      await this.write(name, newData)
    } catch (error) {
      console.error('Error appending data:', error)
      throw new Error('Failed to append data')
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.getDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      await tx.objectStore(STORE_NAME).clear()
      await tx.done
    } catch (error) {
      console.error('Error clearing storage:', error)
      throw new Error('Failed to clear storage')
    }
  }
}

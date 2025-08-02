import { IStorage } from '../types'
import localforage from 'localforage'
import { v4 as uuidv4 } from '@lukeed/uuid'
import debounce from 'lodash/debounce'

type Chunk = {
  id: string
  content: string
}

type Metadata = {
  chunkIds: string[]
}

type Cache = {
  metadata: Metadata
  content: string
}

const MetadataDB = localforage.createInstance({
  name: 'helene-metadata',
  driver: localforage.INDEXEDDB,
})

const ChunksDB = localforage.createInstance({
  name: 'helene-chunks',
  driver: localforage.INDEXEDDB,
})

export class BrowserStorage implements IStorage {
  cache = new Map<string, Cache>()

  async read(name: string) {
    const metadata = await MetadataDB.getItem<Metadata>(name)

    let data = ''

    for (const chunkId of metadata.chunkIds) {
      const chunkData = await ChunksDB.getItem<Chunk>(chunkId)

      if (chunkData) {
        data += chunkData.content
      }
    }

    this.cache.set(name, {
      metadata,
      content: data,
    })

    return data
  }

  async append(name: string, data: string) {
    const cache = this.cache.get(name)

    if (!cache) {
      await this.read(name)
    }

    cache.content += data

    this.debouncedFlush(name)
  }

  async write(name: string, data: string) {
    const cache = this.cache.get(name)

    if (!cache) {
      await this.read(name)
    }

    cache.content = data

    this.debouncedFlush(name)
  }

  async flush(name: string) {
    const cache = this.cache.get(name)

    const newChunks = this.chunkify(cache.content)

    for (const chunk of newChunks) {
      await ChunksDB.setItem(chunk.id, chunk)
    }

    for (const chunkId of cache.metadata.chunkIds) {
      await ChunksDB.removeItem(chunkId)
    }

    await MetadataDB.removeItem(name)

    await MetadataDB.setItem<Metadata>(name, {
      chunkIds: newChunks.map(chunk => chunk.id),
    })

    await this.read(name)
  }

  private chunkify(str: string, chunkSize = 1024) {
    const chunks = []

    for (let i = 0; i < str.length; i += chunkSize) {
      chunks.push({
        id: uuidv4(),
        content: str.slice(i, i + chunkSize),
      })
    }

    return chunks
  }

  debouncedFlush = debounce(this.flush, 1000)
}

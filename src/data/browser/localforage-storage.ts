import { IStorage } from '../types'
import localforage from 'localforage'
import { v4 as uuidv4 } from '@lukeed/uuid'
import debounce from 'lodash/debounce'
import { z } from 'zod'
import LZString from 'lz-string'

const ChunkSchema = z.object({
  id: z.string(),
  content: z.string(),
})

const MetadataSchema = z.object({
  chunkIds: z.array(z.string()),
})

const CacheSchema = z.object({
  metadata: MetadataSchema,
  content: z.string(),
})

const MetadataDB = localforage.createInstance({
  name: 'helene-metadata',
  driver: localforage.INDEXEDDB,
})

const ChunksDB = localforage.createInstance({
  name: 'helene-chunks',
  driver: localforage.INDEXEDDB,
})

export class LocalForageStorage implements IStorage {
  chunkSize = 512 * 1024

  cache = new Map<string, z.infer<typeof CacheSchema>>()

  async read(name: string) {
    const metadata =
      await MetadataDB.getItem<z.infer<typeof MetadataSchema>>(name)

    if (!metadata) {
      this.cache.set(name, {
        metadata: { chunkIds: [] },
        content: '',
      })
      return ''
    }

    const validatedMetadata = MetadataSchema.safeParse(metadata)

    if (!validatedMetadata.success) {
      console.error(':invalid_metadata', validatedMetadata.error)
      return ''
    }

    let data = ''

    for (const chunkId of metadata.chunkIds) {
      const chunkData =
        await ChunksDB.getItem<z.infer<typeof ChunkSchema>>(chunkId)

      if (chunkData) {
        data += LZString.decompress(chunkData.content)
      }
    }

    this.cache.set(name, {
      metadata,
      content: data,
    })

    return data
  }

  async append(name: string, data: string) {
    let cache = this.cache.get(name)

    if (!cache) {
      await this.read(name)
      cache = this.cache.get(name)
    }

    if (!cache) {
      this.cache.set(name, {
        metadata: { chunkIds: [] },
        content: data,
      })
    } else {
      cache.content += data
    }

    this.debouncedFlush(name)
  }

  async write(name: string, data: string) {
    let cache = this.cache.get(name)

    if (!cache) {
      await this.read(name)
      cache = this.cache.get(name)
    }

    if (!cache) {
      this.cache.set(name, {
        metadata: { chunkIds: [] },
        content: data,
      })
    } else {
      cache.content = data
    }

    this.debouncedFlush(name)
  }

  async flush(name: string) {
    const cache = this.cache.get(name)

    if (!cache) {
      return
    }

    const newChunks = this.chunkify(cache.content)

    for (const chunk of newChunks) {
      await ChunksDB.setItem(chunk.id, chunk)
    }

    for (const chunkId of cache.metadata.chunkIds) {
      await ChunksDB.removeItem(chunkId)
    }

    await MetadataDB.removeItem(name)

    await MetadataDB.setItem<z.infer<typeof MetadataSchema>>(name, {
      chunkIds: newChunks.map(chunk => chunk.id),
    })

    await this.read(name)
  }

  private chunkify(str: string, chunkSize = this.chunkSize) {
    const chunks = []

    for (let i = 0; i < str.length; i += chunkSize) {
      chunks.push({
        id: uuidv4(),
        content: LZString.compress(str.slice(i, i + chunkSize)),
      })
    }

    return chunks
  }

  debouncedFlush = debounce(this.flush, 1000)
}

import { IStorage } from '../types'
import localforage from 'localforage'
import debounce from 'lodash/debounce'
import { z } from 'zod'
import LZString from 'lz-string'
import difference from 'lodash/difference'

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

    const newChunks = await this.chunkify(
      cache.content,
      cache.metadata.chunkIds,
    )

    const existingChunkIds = cache.metadata.chunkIds
    const newChunkIds = newChunks.map(chunk => chunk.id)

    const chunkIdsToRemove = difference(existingChunkIds, newChunkIds)

    for (const chunk of newChunks) {
      if (existingChunkIds.includes(chunk.id)) {
        continue
      }

      // Might never happen, since we are checking for existing chunk ids already
      if (chunk.content === undefined) {
        continue
      }

      await ChunksDB.setItem(chunk.id, chunk)
    }

    for (const chunkId of chunkIdsToRemove) {
      await ChunksDB.removeItem(chunkId)
    }

    await MetadataDB.removeItem(name)

    await MetadataDB.setItem<z.infer<typeof MetadataSchema>>(name, {
      chunkIds: newChunks.map(chunk => chunk.id),
    })

    await this.read(name)
  }

  private async chunkify(
    str: string,
    existingChunkIds: string[],
    chunkSize = this.chunkSize,
  ) {
    const chunks = []

    for (let i = 0; i < str.length; i += chunkSize) {
      const content = str.slice(i, i + chunkSize)
      const id = await this.sha256(content)

      if (existingChunkIds.includes(id)) {
        chunks.push({
          id,
        })
        continue
      }

      chunks.push({
        id,
        content: LZString.compress(content),
      })
    }

    return chunks
  }

  async sha256(str: string) {
    const encoder = new TextEncoder()
    const data = encoder.encode(str)
    const hash = await crypto.subtle.digest('SHA-256', data)

    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  debouncedFlush = debounce(this.flush, 1000)
}

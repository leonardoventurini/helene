import { EventEmitter2 } from 'eventemitter2'
import defer from 'lodash/defer'
import isArray from 'lodash/isArray'
import isNumber from 'lodash/isNumber'
import isString from 'lodash/isString'
import {
  checkIndexesFromMostToLeast,
  removeExpiredDocuments,
} from './_get-candidates'
import { Cursor, Projection, Query, SortQuery } from './cursor'
import { uid } from './custom-utils'
import { Index } from './indexes'
import { LastStepModifierFunctions } from './last-step-modifier-functions'
import { checkObject, deepCopy, match, modify } from './model'
import { queueOperation } from './op-queue'
import { Persistence } from './persistence'
import { IStorage } from './types'
import { pluck } from './utils'

export const CollectionEvent = {
  READY: 'ready',
  UPDATED: 'updated',
  ERROR: 'error',
  COMPACTED: 'compacted',
}

export type HookFunction = <T = any>(doc: any) => Promise<void>
export type TransformerHookFunction = <T = any>(doc: T) => Promise<T>
export type UpdateHookFunction = <T = any>(
  newDoc: T,
  oldDoc: T,
) => Promise<void>
export type UpdateTransformerHookFunction = <T = any>(
  newDoc: T,
  oldDoc: T,
) => Promise<T>

export type CollectionOptions = {
  name?: string
  timestamps?: boolean
  autoload?: boolean
  onload?: (err?: Error) => void
  afterSerialization?: (doc: any) => any
  beforeDeserialization?: (doc: any) => any
  corruptAlertThreshold?: number
  compareStrings?: (a: string, b: string) => number
  storage?: IStorage

  /**
   * The interval (in milliseconds) at which the datafile will be compacted. Minimum value is 5000 (5 seconds). Default is 60000 (1 minute).
   */
  compactionInterval?: number

  beforeInsert?: TransformerHookFunction
  afterInsert?: HookFunction

  beforeUpdate?: UpdateTransformerHookFunction
  afterUpdate?: UpdateHookFunction

  beforeRemove?: HookFunction
  afterRemove?: HookFunction
}

export type UpdateQuery = Partial<{
  [key in keyof typeof LastStepModifierFunctions]: any
}> &
  Record<string, any>

export type UpdateOptions = {
  multi?: boolean
  upsert?: boolean
  returnUpdatedDocs?: boolean
  [key: string]: any
}

export type IndexOptions = {
  fieldName: string
  unique?: boolean
  sparse?: boolean
  expireAfterSeconds?: number
}

export type BaseDocument = {
  _id?: string | number
  [key: string]: any
}

export class Collection<
  CT extends BaseDocument = BaseDocument,
> extends EventEmitter2 {
  name: string | null
  inMemoryOnly: boolean
  autoload: boolean
  timestampData: boolean
  compareStrings: (a: string, b: string) => number
  persistence: Persistence
  indexes: Record<string, Index>

  ttlIndexes: Record<string, any>

  ready = false

  beforeInsert: TransformerHookFunction
  afterInsert: HookFunction

  beforeUpdate: UpdateTransformerHookFunction
  afterUpdate: UpdateHookFunction

  beforeRemove: TransformerHookFunction
  afterRemove: HookFunction

  constructor({
    name,
    storage,
    autoload = false,
    timestamps = false,
    compareStrings,
    corruptAlertThreshold,
    onload,
    afterSerialization,
    beforeDeserialization,
    compactionInterval = 60000,

    beforeInsert = doc => Promise.resolve(doc),
    afterInsert = () => void 0,

    beforeUpdate = doc => Promise.resolve(doc),
    afterUpdate = () => void 0,

    beforeRemove = doc => Promise.resolve(doc),
    afterRemove = () => void 0,
  }: CollectionOptions = {}) {
    super()

    this.autoload = autoload
    this.timestampData = timestamps

    // If no name or no storage strategy then the database will be in memory only
    this.inMemoryOnly = false

    // Determine whether in memory or persistent
    if (isString(name) && name.length > 0) {
      this.name = name
    } else {
      this.name = null
      this.inMemoryOnly = true
    }

    if (!storage) {
      this.inMemoryOnly = true
    }

    // String comparison function
    this.compareStrings = compareStrings

    // Persistence handling
    this.persistence = new Persistence({
      db: this,
      afterSerialization,
      beforeDeserialization,
      corruptAlertThreshold,
    })

    if (isNumber(compactionInterval) && compactionInterval > 0) {
      this.persistence.setAutocompactionInterval(compactionInterval)
    }

    if (storage) {
      this.persistence.storage = storage
    }

    // Indexed by field name, dot notation can be used
    // _id is always indexed and since _ids are generated randomly the underlying
    // binary is always well-balanced
    this.indexes = {}
    this.indexes._id = new Index({ fieldName: '_id', unique: true })
    this.ttlIndexes = {}

    // Queue a load of the database right away and call the onload handler
    // By default (no onload handler), if there is an error there, no operation will be possible so warn the user by throwing an exception
    if (this.autoload) {
      this.loadDatabase()
        .then(() => {
          onload?.()
        })
        .catch(err => {
          onload?.(err)
          this.deferEmit(CollectionEvent.ERROR, err)
        })
        .finally(() => {
          this.ready = true
          this.deferEmit(CollectionEvent.READY)
        })
    } else {
      defer(() => {
        this.ready = true
        this.emit(CollectionEvent.READY)
      })
    }

    this.beforeInsert = beforeInsert.bind(this)
    this.afterInsert = afterInsert.bind(this)

    this.beforeUpdate = beforeUpdate.bind(this)
    this.afterUpdate = afterUpdate.bind(this)

    this.beforeRemove = beforeRemove.bind(this)
    this.afterRemove = afterRemove.bind(this)

    this.setMaxListeners(1024)
  }

  deferEmit(event: string, ...args: any[]) {
    defer(() => {
      this.emit(event, ...args)
    })
  }

  /**
   * Load the database from the datafile, and trigger the execution of buffered commands if any
   */
  loadDatabase() {
    return this.persistence.loadDatabase()
  }

  /**
   * Get an array of all the data in the database
   */
  getAllData() {
    return this.indexes._id.getAll()
  }

  /**
   * Reset all currently defined indexes
   */
  resetIndexes(newData?: any[]) {
    Object.keys(this.indexes).forEach(i => {
      this.indexes[i].reset(newData)
    })
  }

  /**
   * Ensure an index is kept for this field. Same parameters as lib/indexes
   * For now this function is synchronous, we need to test how much time it takes
   * We use an async API for consistency with the rest of the code
   */
  async ensureIndex(options: IndexOptions) {
    let err: Error & { missingFieldName?: boolean }

    if (!options.fieldName) {
      err = new Error('Cannot create an index without a fieldName')
      err.missingFieldName = true
      throw err
    }

    if (this.indexes[options.fieldName]) {
      return null
    }

    this.indexes[options.fieldName] = new Index(options)

    if (options.expireAfterSeconds !== undefined) {
      this.ttlIndexes[options.fieldName] = options.expireAfterSeconds
    } // With this implementation, index creation is not necessary to ensure TTL, but we stick with MongoDB's API here

    try {
      this.indexes[options.fieldName].insert(this.getAllData())
    } catch (e) {
      delete this.indexes[options.fieldName]
      throw e
    }

    // We may want to force all options to be persisted including defaults, not just the ones passed the index creation function
    await this.persistence.persistNewState([{ $$indexCreated: options }])
  }

  /**
   * Remove an index
   */
  async removeIndex(fieldName: string) {
    delete this.indexes[fieldName]

    await this.persistence.persistNewState([{ $$indexRemoved: fieldName }])
  }

  /**
   * Add one or several document(s) to all indexes
   */
  addToIndexes(doc: CT) {
    let i: number, failingIndex: number, error: Error
    const keys = Object.keys(this.indexes)
    for (i = 0; i < keys.length; i += 1) {
      try {
        this.indexes[keys[i]].insert(doc)
      } catch (e) {
        failingIndex = i
        error = e
        break
      }
    }

    // If an error happened, we need to roll back the insert on all other indexes
    if (error) {
      for (i = 0; i < failingIndex; i += 1) {
        this.indexes[keys[i]].remove(doc)
      }

      throw error
    }
  }

  /**
   * Remove one or several document(s) from all indexes
   */
  removeFromIndexes(doc: CT) {
    const self = this

    Object.keys(this.indexes).forEach(function (i) {
      self.indexes[i].remove(doc)
    })
  }

  /**
   * Update one or several documents in all indexes
   * To update multiple documents, oldDoc must be an array of { oldDoc, newDoc } pairs
   * If one update violates a constraint, all changes are rolled back
   */
  updateIndexes(oldDoc: Record<string, any>, newDoc?: Record<string, any>) {
    let i, failingIndex, error

    const keys = Object.keys(this.indexes)

    for (i = 0; i < keys.length; i += 1) {
      try {
        this.indexes[keys[i]].update(oldDoc, newDoc)
      } catch (e) {
        failingIndex = i
        error = e
        break
      }
    }

    // If an error happened, we need to rollback the update on all other indexes
    if (error) {
      for (i = 0; i < failingIndex; i += 1) {
        this.indexes[keys[i]].revertUpdate(oldDoc, newDoc)
      }

      throw error
    }
  }

  /**
   * Return the list of candidates for a given query
   * Crude implementation for now, we return the candidates given by the first usable index if any
   * We try the following query types, in this order: basic match, $in match, comparison match
   * One way to make it better would be to enable the use of multiple indexes if the first usable index
   * returns too much data. I may do it in the future.
   *
   * Returned candidates will be scanned to find and remove all expired documents
   *
   * @param {Query} query
   * @param {Boolean} dontExpireStaleDocs Optional, defaults to false, if true don't remove stale docs. Useful for the remove function which shouldn't be impacted by expirations
   */
  async getCandidates(query, dontExpireStaleDocs = false) {
    const indexNames = Object.keys(this.indexes)

    const docs = await checkIndexesFromMostToLeast.call(this, query, indexNames)

    return await removeExpiredDocuments.call(this, docs, dontExpireStaleDocs)
  }

  async insert(newDoc: CT): Promise<CT> {
    return queueOperation(async () => {
      if (Array.isArray(newDoc)) {
        throw new Error('insert cannot be called with an array')
      }

      const preparedDoc = await this.prepareDocumentForInsertion(newDoc)

      this._insertInCache(preparedDoc)

      const docs = isArray(preparedDoc) ? preparedDoc : [preparedDoc]

      queueOperation(async () => this.persistence.persistNewState(docs)).catch(
        console.error,
      )

      await Promise.all(docs.map(doc => this.afterInsert(doc)))

      return deepCopy(preparedDoc)
    })
  }

  /**
   * Create a new _id that's not already in use
   */
  createNewId(): string {
    let tentativeId = uid(16)
    // Try as many times as needed to get an unused _id. As explained in customUtils, the probability of this ever happening is tiny, so this is O(1)
    if (this.indexes._id.getMatching(tentativeId).length > 0) {
      tentativeId = this.createNewId()
    }
    return tentativeId
  }

  /**
   * Prepare a document (or array of documents) to be inserted in a database
   * Meaning adds _id and timestamps if necessary on a copy of newDoc to avoid any side effect on user input
   * @api private
   */
  async prepareDocumentForInsertion(newDoc) {
    let preparedDoc

    if (isArray(newDoc)) {
      preparedDoc = await Promise.all(
        newDoc.map(doc => this.prepareDocumentForInsertion(doc)),
      )
    } else {
      preparedDoc = deepCopy(newDoc)
      preparedDoc = await this.beforeInsert(preparedDoc)

      if (preparedDoc._id === undefined) {
        preparedDoc._id = this.createNewId()
      }

      const now = new Date()

      if (this.timestampData && preparedDoc.createdAt === undefined) {
        preparedDoc.createdAt = now
      }

      if (this.timestampData && preparedDoc.updatedAt === undefined) {
        preparedDoc.updatedAt = now
      }

      checkObject(preparedDoc)
    }

    return preparedDoc
  }

  /**
   * If newDoc is an array of documents, this will insert all documents in the cache
   * @api private
   */
  _insertInCache(preparedDoc) {
    if (isArray(preparedDoc)) {
      this._insertMultipleDocsInCache(preparedDoc)
    } else {
      this.addToIndexes(preparedDoc)
    }
  }

  /**
   * If one insertion fails (e.g. because of a unique constraint), roll back all previous
   * inserts and throws the error
   * @api private
   */
  _insertMultipleDocsInCache(preparedDocs) {
    let i, failingI, error

    for (i = 0; i < preparedDocs.length; i += 1) {
      try {
        this.addToIndexes(preparedDocs[i])
      } catch (e) {
        error = e
        failingI = i
        break
      }
    }

    if (error) {
      for (i = 0; i < failingI; i += 1) {
        this.removeFromIndexes(preparedDocs[i])
      }

      throw error
    }
  }

  async ensureReady() {
    if (!this.ready) {
      await this.waitFor(CollectionEvent.READY)
    }
  }

  async count(query: Query) {
    await this.ensureReady()

    const cursor = new Cursor(this, query)

    const docs = await cursor

    return docs.length
  }

  find(query?: Query, projection?: Projection) {
    const cursor = new Cursor<CT>(this, query)

    if (projection) {
      return cursor.projection(projection)
    }

    return cursor
  }

  async findOne(
    query: Query,
    projection?: Projection,
    sort?: SortQuery,
  ): Promise<CT> {
    await this.ensureReady()

    const cursor = new Cursor<CT>(this, query)

    const result = await cursor.projection(projection).sort(sort).limit(1)

    return result[0] ?? null
  }

  async update(
    query: Query,
    updateQuery: UpdateQuery,
    options?: UpdateOptions,
  ): Promise<any> {
    await this.ensureReady()

    let numReplaced = 0,
      i: number

    const multi = Boolean(options?.multi)
    const upsert = Boolean(options?.upsert)

    // If an upsert option is set, check whether we need to insert the doc
    if (upsert) {
      const cursor = new Cursor(this, query)
      const docs = await cursor.limit(1)

      if (docs.length !== 1) {
        let toBeInserted: CT

        try {
          checkObject(updateQuery)
          // updateQuery is a simple object with no modifier, use it as the document to insert
          toBeInserted = updateQuery as CT
        } catch (e) {
          // updateQuery contains modifiers, use the find query as the base,
          // strip it from all operators and update it according to updateQuery
          toBeInserted = modify(deepCopy(query, true), updateQuery)
        }

        const newDoc = await this.insert(toBeInserted)

        return {
          acknowledged: true,
          insertedIds: [newDoc._id],
          insertedDocs: [newDoc],
          insertedCount: 1,
          upsert: true,
        }
      }
    }

    return queueOperation(async () => {
      // Perform the update
      let modifiedDoc: { createdAt: Date; updatedAt: Date }, createdAt: Date

      const modifications = []

      const candidates = await this.getCandidates(query)

      for (i = 0; i < candidates.length; i += 1) {
        if (match(candidates[i], query) && (multi || numReplaced === 0)) {
          numReplaced += 1

          if (this.timestampData) {
            createdAt = candidates[i].createdAt
          }

          modifiedDoc = modify(candidates[i], updateQuery)

          modifiedDoc = await this.beforeUpdate(modifiedDoc, candidates[i])

          if (this.timestampData) {
            modifiedDoc.createdAt = createdAt
            modifiedDoc.updatedAt = new Date()
          }

          await this.afterUpdate(modifiedDoc, candidates[i])

          modifications.push({
            oldDoc: candidates[i],
            newDoc: modifiedDoc,
          })
        }
      }

      // Change the docs in memory
      this.updateIndexes(modifications)

      // Update the datafile
      const updatedDocs = pluck(modifications, 'newDoc')

      queueOperation(async () =>
        this.persistence.persistNewState(updatedDocs),
      ).catch(console.error)

      if (options?.returnUpdatedDocs) {
        const updatedDocsDC = []
        updatedDocs.forEach(doc => updatedDocsDC.push(deepCopy(doc)))

        return {
          acknowledged: true,
          modifiedCount: numReplaced,
          updatedDocs: updatedDocsDC,
        }
      } else {
        return {
          acknowledged: true,
          modifiedCount: numReplaced,
        }
      }
    })
  }

  async updateOne(
    query: Query,
    updateQuery: UpdateQuery,
    options?: Omit<UpdateOptions, 'multi'>,
  ) {
    return this.update(query, updateQuery, {
      ...options,
      multi: false,
    })
  }

  async updateMany(
    query: Query,
    updateQuery: UpdateQuery,
    options?: Omit<UpdateOptions, 'multi'>,
  ) {
    return this.update(query, updateQuery, {
      ...options,
      multi: true,
    })
  }

  async remove(query: Query, options?: { multi?: boolean }) {
    await this.ensureReady()

    return queueOperation(async () => {
      let numRemoved = 0

      const self = this
      const removedDocs = []

      const multi = Boolean(options?.multi)

      const candidates = await this.getCandidates(query, true)

      for (const candidate of candidates) {
        if (match(candidate, query) && (multi || numRemoved === 0)) {
          await this.beforeRemove(candidate)
          numRemoved += 1
          removedDocs.push({ $$deleted: true, _id: candidate._id })
          self.removeFromIndexes(candidate)
        }
      }

      queueOperation(async () =>
        self.persistence.persistNewState(removedDocs),
      ).catch(console.error)

      await Promise.all(candidates.map(doc => self.afterRemove(doc)))

      return numRemoved
    })
  }

  async deleteOne(query: Query) {
    return this.remove(query, { multi: false })
  }

  async deleteMany(query: Query) {
    return this.remove(query, { multi: true })
  }
}

/**
 * Creates a new collection and waits until it is ready.
 */
export async function createCollection<CT extends BaseDocument = BaseDocument>(
  options: CollectionOptions,
) {
  const collection = new Collection<CT>(options)

  collection.on(CollectionEvent.ERROR, err => {
    throw err
  })

  if (collection.ready) {
    return collection
  }

  await collection.waitFor(CollectionEvent.READY)

  return collection
}

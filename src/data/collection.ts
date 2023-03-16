import { Index } from './indexes'
import { isArray, isString, noop } from 'lodash'
import { Persistence } from './persistence'
import { Cursor } from './cursor'
import { uid } from './custom-utils'
import { checkObject, deepCopy, match, modify } from './model'
import { pluck } from './utils'
import { EventEmitter2 } from 'eventemitter2'
import {
  checkIndexesFromMostToLeast,
  removeExpiredDocuments,
} from './_get-candidates'

type Options = {
  filename?: string
  timestampData?: boolean
  inMemoryOnly?: boolean
  autoload?: boolean
  onload?: (err?: Error) => void
  afterSerialization?: (doc: any) => any
  beforeDeserialization?: (doc: any) => any
  corruptAlertThreshold?: number
  compareStrings?: (a: string, b: string) => number
}

export class Collection extends EventEmitter2 {
  name: string | null
  inMemoryOnly: boolean
  autoload: boolean
  timestampData: boolean
  compareStrings: (a: string, b: string) => number
  persistence: Persistence
  indexes: Record<string, Index>

  ttlIndexes: Record<string, any>

  constructor(_options?: Options | string) {
    super()

    let filename
    let options: Options = {}

    // Retrocompatibility with v0.6 and before
    if (isString(_options)) {
      filename = _options
      this.inMemoryOnly = false // Default
    } else {
      options = _options || {}
      filename = options.filename
      this.inMemoryOnly = options.inMemoryOnly || false
      this.autoload = options.autoload || false
      this.timestampData = options.timestampData || false
    }

    // Determine whether in memory or persistent
    if (!filename || typeof filename !== 'string' || filename.length === 0) {
      this.name = null
      this.inMemoryOnly = true
    } else {
      this.name = filename
    }

    // String comparison function
    this.compareStrings = options.compareStrings

    // Persistence handling
    this.persistence = new Persistence({
      db: this,
      afterSerialization: options.afterSerialization,
      beforeDeserialization: options.beforeDeserialization,
      corruptAlertThreshold: options.corruptAlertThreshold,
    })

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
          this.emit('ready')
          options?.onload?.()
        })
        .catch(err => {
          options?.onload?.(err)
        })
    }
  }

  /**
   * Load the database from the datafile, and trigger the execution of buffered commands if any
   */
  async loadDatabase() {
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
  resetIndexes(newData?) {
    Object.keys(this.indexes).forEach(i => {
      this.indexes[i].reset(newData)
    })
  }

  /**
   * Ensure an index is kept for this field. Same parameters as lib/indexes
   * For now this function is synchronous, we need to test how much time it takes
   * We use an async API for consistency with the rest of the code
   * @param {String} options.fieldName
   * @param {Boolean} options.unique
   * @param {Boolean} options.sparse
   * @param {Number} options.expireAfterSeconds - Optional, if set this index becomes a TTL index (only works on Date fields, not arrays of Date)
   * @param options
   */
  async ensureIndex(options) {
    let err

    options = options || {}

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
    } // With this implementation index creation is not necessary to ensure TTL but we stick with MongoDB's API here

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
  addToIndexes(doc) {
    let i, failingIndex, error
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

    // If an error happened, we need to rollback the insert on all other indexes
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
  removeFromIndexes(doc) {
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
  updateIndexes(oldDoc, newDoc?) {
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

  /**
   * Insert a new document
   * @param newDoc
   * @param {Function} insertCallback Optional callback, signature: err, insertedDoc
   *
   * @api private Use Datastore.insert which has the same signature
   */
  async insert(newDoc, insertCallback = noop) {
    const preparedDoc = this.prepareDocumentForInsertion(newDoc)

    this._insertInCache(preparedDoc)

    await this.persistence.persistNewState(
      isArray(preparedDoc) ? preparedDoc : [preparedDoc],
    )

    return deepCopy(preparedDoc)
  }

  /**
   * Create a new _id that's not already in use
   */
  createNewId() {
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
  prepareDocumentForInsertion(newDoc) {
    let preparedDoc
    const self = this

    if (isArray(newDoc)) {
      preparedDoc = []
      newDoc.forEach(function (doc) {
        preparedDoc.push(self.prepareDocumentForInsertion(doc))
      })
    } else {
      preparedDoc = deepCopy(newDoc)
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

  /**
   * Count all documents matching the query
   * @param {Object} query MongoDB-style query
   */
  async count(query) {
    const cursor = new Cursor(this, query, async function (docs) {
      return docs.length
    })

    return (await cursor) as unknown as number
  }

  /**
   * Find all documents matching the query
   * If no callback is passed, we return the cursor so that user can limit, skip and finally exec
   * @param {Object} query MongoDB-style query
   * @param {Object} projection MongoDB-style projection
   */
  find(query?, projection?) {
    const cursor = new Cursor(this, query, async function (docs) {
      const res = []

      for (let i = 0; i < docs.length; i += 1) {
        res.push(deepCopy(docs[i]))
      }

      return res
    })

    cursor.projection(projection)

    return cursor
  }

  async findOne(query, projection?) {
    const cursor = new Cursor(this, query, async function (docs) {
      if (docs.length === 1) {
        return deepCopy(docs[0])
      } else {
        return null
      }
    })

    cursor.projection(projection).limit(1)

    return (await cursor) as any
  }

  async update(query, updateQuery, options?): Promise<any> {
    let numReplaced = 0,
      i

    const multi = Boolean(options?.multi)
    const upsert = Boolean(options?.upsert)

    // If upsert option is set, check whether we need to insert the doc
    if (upsert) {
      const cursor = new Cursor(this, query)
      const docs = await cursor.limit(1)

      if (docs.length !== 1) {
        let toBeInserted

        try {
          checkObject(updateQuery)
          // updateQuery is a simple object with no modifier, use it as the document to insert
          toBeInserted = updateQuery
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

    // Perform the update
    let modifiedDoc, createdAt

    const modifications = []

    const candidates = await this.getCandidates(query)

    for (i = 0; i < candidates.length; i += 1) {
      if (match(candidates[i], query) && (multi || numReplaced === 0)) {
        numReplaced += 1
        if (this.timestampData) {
          createdAt = candidates[i].createdAt
        }
        modifiedDoc = modify(candidates[i], updateQuery)
        if (this.timestampData) {
          modifiedDoc.createdAt = createdAt
          modifiedDoc.updatedAt = new Date()
        }
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

    await this.persistence.persistNewState(updatedDocs)

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
  }

  async remove(query, options?) {
    let numRemoved = 0

    const self = this
    const removedDocs = []

    const multi = Boolean(options?.multi)

    const candidates = await this.getCandidates(query, true)

    candidates.forEach(function (d) {
      if (match(d, query) && (multi || numRemoved === 0)) {
        numRemoved += 1
        removedDocs.push({ $$deleted: true, _id: d._id })
        self.removeFromIndexes(d)
      }
    })

    await self.persistence.persistNewState(removedDocs)

    return numRemoved
  }
}

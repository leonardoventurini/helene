import async from 'async'
import { Executor } from './executor'
import { Index } from './indexes'
import util from 'util'
import _, { isArray, isDate, isObject, noop } from 'lodash'
import { Persistence } from './persistence'
import { Cursor } from './cursor'
import { uid } from './custom-utils'
import { checkObject, deepCopy, match, modify } from './model'
import { pluck } from './utils'
import { EventEmitter2 } from 'eventemitter2'

type Options = {
  filename?: string
  timestampData?: boolean
  inMemoryOnly?: boolean
  autoload?: boolean
  onload?: (err: Error) => void
  afterSerialization?: (doc: any) => any
  beforeDeserialization?: (doc: any) => any
  corruptAlertThreshold?: number
  compareStrings?: (a: string, b: string) => number
}

export class Datastore extends EventEmitter2 {
  filename: string | null
  inMemoryOnly: boolean
  autoload: boolean
  timestampData: boolean
  compareStrings: (a: string, b: string) => number
  persistence: Persistence
  executor: Executor
  indexes: Record<string, Index>

  ttlIndexes: Record<string, any>

  /**
   * Create a new collection
   * @param {String} options.filename Optional, datastore will be in-memory only if not provided
   * @param {Boolean} options.timestampData Optional, defaults to false. If set to true, createdAt and updatedAt will be created and populated automatically (if not specified by user)
   * @param {Boolean} options.inMemoryOnly Optional, defaults to false
   * @param {String} options.nodeWebkitAppName Optional, specify the name of your NW app if you want options.filename to be relative to the directory where
   *                                            Node Webkit stores application data such as cookies and local storage (the best place to store data in my opinion)
   * @param {Boolean} options.autoload Optional, defaults to false
   * @param {Function} options.onload Optional, if autoload is used this will be called after the load database with the error object as parameter. If you don't pass it the error will be thrown
   * @param {Function} options.afterSerialization/options.beforeDeserialization Optional, serialization hooks
   * @param {Number} options.corruptAlertThreshold Optional, threshold after which an alert is thrown if too much data is corrupt
   * @param {Function} options.compareStrings Optional, string comparison function that overrides default for sorting
   *
   * Event Emitter - Events
   * * compaction.done - Fired whenever a compaction operation was finished
   */
  constructor(options?: Options) {
    super()

    let filename

    // Retrocompatibility with v0.6 and before
    if (typeof options === 'string') {
      filename = options
      this.inMemoryOnly = false // Default
    } else {
      options = options || {}
      filename = options.filename
      this.inMemoryOnly = options.inMemoryOnly || false
      this.autoload = options.autoload || false
      this.timestampData = options.timestampData || false
    }

    // Determine whether in memory or persistent
    if (!filename || typeof filename !== 'string' || filename.length === 0) {
      this.filename = null
      this.inMemoryOnly = true
    } else {
      this.filename = filename
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

    // This new executor is ready if we don't use persistence
    // If we do, it will only be ready once loadDatabase is called
    this.executor = new Executor()
    if (this.inMemoryOnly) {
      this.executor.ready = true
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
      this.loadDatabase(
        options.onload ||
          function (err) {
            if (err) {
              throw err
            }
          },
      )
    }
  }

  /**
   * Load the database from the datafile, and trigger the execution of buffered commands if any
   */
  loadDatabase(...args) {
    this.executor.push(
      {
        this: this.persistence,
        fn: this.persistence.loadDatabase,
        arguments: args,
      },
      true,
    )
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
    const self = this

    Object.keys(this.indexes).forEach(function (i) {
      self.indexes[i].reset(newData)
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
   * @param {Function} cb Optional callback, signature: err
   */
  ensureIndex(options, cb?) {
    let err
    const callback = cb || noop

    options = options || {}

    if (!options.fieldName) {
      err = new Error('Cannot create an index without a fieldName')
      err.missingFieldName = true
      return callback(err)
    }
    if (this.indexes[options.fieldName]) {
      return callback(null)
    }

    this.indexes[options.fieldName] = new Index(options)
    if (options.expireAfterSeconds !== undefined) {
      this.ttlIndexes[options.fieldName] = options.expireAfterSeconds
    } // With this implementation index creation is not necessary to ensure TTL but we stick with MongoDB's API here

    try {
      this.indexes[options.fieldName].insert(this.getAllData())
    } catch (e) {
      delete this.indexes[options.fieldName]
      return callback(e)
    }

    // We may want to force all options to be persisted including defaults, not just the ones passed the index creation function
    this.persistence.persistNewState(
      [{ $$indexCreated: options }],
      function (err) {
        if (err) {
          return callback(err)
        }
        return callback(null)
      },
    )
  }

  /**
   * Remove an index
   * @param {String} fieldName
   * @param {Function} cb Optional callback, signature: err
   */
  removeIndex(fieldName, cb) {
    const callback = cb || noop

    delete this.indexes[fieldName]

    this.persistence.persistNewState(
      [{ $$indexRemoved: fieldName }],
      function (err) {
        if (err) {
          return callback(err)
        }
        return callback(null)
      },
    )
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
   * @param {Function} callback Signature err, candidates
   */
  getCandidates(query, dontExpireStaleDocs, callback?) {
    const indexNames = Object.keys(this.indexes),
      self = this
    let usableQueryKeys

    if (typeof dontExpireStaleDocs === 'function') {
      callback = dontExpireStaleDocs
      dontExpireStaleDocs = false
    }

    async.waterfall(
      [
        // STEP 1: get candidates list by checking indexes from most to least frequent usecase
        function (cb) {
          // For a basic match
          usableQueryKeys = []
          Object.keys(query).forEach(function (k) {
            if (
              typeof query[k] === 'string' ||
              typeof query[k] === 'number' ||
              typeof query[k] === 'boolean' ||
              util.isDate(query[k]) ||
              query[k] === null
            ) {
              usableQueryKeys.push(k)
            }
          })
          usableQueryKeys = _.intersection(usableQueryKeys, indexNames)
          if (usableQueryKeys.length > 0) {
            return cb(
              null,
              self.indexes[usableQueryKeys[0]].getMatching(
                query[usableQueryKeys[0]],
              ),
            )
          }

          // For $in match
          usableQueryKeys = []
          Object.keys(query).forEach(function (k) {
            if (isObject(query[k]) && '$in' in query[k]) {
              usableQueryKeys.push(k)
            }
          })
          usableQueryKeys = _.intersection(usableQueryKeys, indexNames)
          if (usableQueryKeys.length > 0) {
            return cb(
              null,
              self.indexes[usableQueryKeys[0]].getMatching(
                query[usableQueryKeys[0]].$in,
              ),
            )
          }

          // For a comparison match
          usableQueryKeys = []
          Object.keys(query).forEach(function (k) {
            const item = query[k]

            const modifiers = ['$lt', '$lte', '$gt', '$gte']

            if (isObject(query[k]) && modifiers.some(m => m in item)) {
              usableQueryKeys.push(k)
            }
          })
          usableQueryKeys = _.intersection(usableQueryKeys, indexNames)
          if (usableQueryKeys.length > 0) {
            return cb(
              null,
              self.indexes[usableQueryKeys[0]].getBetweenBounds(
                query[usableQueryKeys[0]],
              ),
            )
          }

          // By default, return all the DB data
          return cb(null, self.getAllData())
        },
        // STEP 2: remove all expired documents
        function (docs, wcb) {
          if (dontExpireStaleDocs) {
            return wcb(null, docs)
          }

          const expiredDocsIds = [],
            validDocs = [],
            ttlIndexesFieldNames = Object.keys(self.ttlIndexes)

          docs.forEach(function (doc) {
            let valid = true
            ttlIndexesFieldNames.forEach(function (i) {
              if (
                doc[i] !== undefined &&
                isDate(doc[i]) &&
                Date.now() > doc[i].getTime() + self.ttlIndexes[i] * 1000
              ) {
                valid = false
              }
            })
            if (valid) {
              validDocs.push(doc)
            } else {
              expiredDocsIds.push(doc._id)
            }
          })

          async.eachSeries(
            expiredDocsIds,
            function (_id, cb) {
              self._remove({ _id: _id }, {}, function (err) {
                if (err) {
                  return wcb(err)
                }
                return cb()
              })
            },
            function (err) {
              return wcb(null, validDocs)
            },
          )
        },
      ],
      function (err, res) {
        if (err) {
          return callback(err)
        }
        return callback(null, res)
      },
    )
  }

  /**
   * Insert a new document
   * @param newDoc
   * @param {Function} insertCallback Optional callback, signature: err, insertedDoc
   *
   * @api private Use Datastore.insert which has the same signature
   */
  _insert(newDoc, insertCallback = noop) {
    let preparedDoc

    try {
      preparedDoc = this.prepareDocumentForInsertion(newDoc)
      this._insertInCache(preparedDoc)
    } catch (e) {
      return insertCallback(e)
    }

    this.persistence.persistNewState(
      isArray(preparedDoc) ? preparedDoc : [preparedDoc],
      function (err) {
        if (err) {
          return insertCallback(err)
        }
        return insertCallback(null, deepCopy(preparedDoc))
      },
    )
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

    if (util.isArray(newDoc)) {
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

  insert(...args) {
    this.executor.push({ this: this, fn: this._insert, arguments: args })
  }

  /**
   * Count all documents matching the query
   * @param {Object} query MongoDB-style query
   */
  count(query, callback) {
    const cursor = new Cursor(this, query, function (err, docs, callback) {
      if (err) {
        return callback(err)
      }
      return callback(null, docs.length)
    })

    if (typeof callback === 'function') {
      cursor.exec(callback)
    } else {
      return cursor
    }
  }

  /**
   * Find all documents matching the query
   * If no callback is passed, we return the cursor so that user can limit, skip and finally exec
   * @param {Object} query MongoDB-style query
   * @param {Object} projection MongoDB-style projection
   * @param callback
   */
  find(query, projection, callback) {
    switch (arguments.length) {
      case 1:
        projection = {}
        // callback is undefined, will return a cursor
        break
      case 2:
        if (typeof projection === 'function') {
          callback = projection
          projection = {}
        } // If not assume projection is an object and callback undefined
        break
    }

    const cursor = new Cursor(this, query, function (err, docs, _callback) {
      const res = []

      if (err) {
        return _callback(err)
      }

      for (let i = 0; i < docs.length; i += 1) {
        res.push(deepCopy(docs[i]))
      }

      return _callback(null, res)
    })

    cursor.projection(projection)

    if (typeof callback === 'function') {
      cursor.exec(callback)
    } else {
      return cursor
    }
  }

  /**
   * Find one document matching the query
   * @param {Object} query MongoDB-style query
   * @param {Object} projection MongoDB-style projection
   * @param callback
   */
  findOne(query, projection, callback) {
    switch (arguments.length) {
      case 1:
        projection = {}
        // callback is undefined, will return a cursor
        break
      case 2:
        if (typeof projection === 'function') {
          callback = projection
          projection = {}
        } // If not assume projection is an object and callback undefined
        break
    }

    const cursor = new Cursor(this, query, function (err, docs, _callback) {
      if (err) {
        return _callback(err)
      }

      if (docs.length === 1) {
        return _callback(null, deepCopy(docs[0]))
      } else {
        return _callback(null, null)
      }
    })

    cursor.projection(projection).limit(1)

    if (typeof callback === 'function') {
      cursor.exec(callback)
    } else {
      return cursor
    }
  }

  /**
   * Update all docs matching query
   * @param {Object} query
   * @param {Object} updateQuery
   * @param {Object} options Optional options
   *                 options.multi If true, can update multiple documents (defaults to false)
   *                 options.upsert If true, document is inserted if the query doesn't match anything
   *                 options.returnUpdatedDocs Defaults to false, if true return as third argument the array of updated matched documents (even if no change actually took place)
   * @param {Function} cb Optional callback, signature: (err, numAffected, affectedDocuments, upsert)
   *                      If update was an upsert, upsert flag is set to true
   *                      affectedDocuments can be one of the following:
   *                        * For an upsert, the upserted document
   *                        * For an update with returnUpdatedDocs option false, null
   *                        * For an update with returnUpdatedDocs true and multi false, the updated document
   *                        * For an update with returnUpdatedDocs true and multi true, the array of updated documents
   *
   * WARNING: The API was changed between v1.7.4 and v1.8, for consistency and readability reasons. Prior and including to v1.7.4,
   *          the callback signature was (err, numAffected, updated) where updated was the updated document in case of an upsert
   *          or the array of updated documents for an update if the returnUpdatedDocs option was true. That meant that the type of
   *          affectedDocuments in a non multi update depended on whether there was an upsert or not, leaving only two ways for the
   *          user to check whether an upsert had occured: checking the type of affectedDocuments or running another find query on
   *          the whole dataset to check its size. Both options being ugly, the breaking change was necessary.
   *
   * @api private Use Datastore.update which has the same signature
   */
  _update(query, updateQuery, options, cb) {
    let numReplaced = 0,
      i

    if (typeof options === 'function') {
      cb = options
      options = {}
    }
    const self = this
    const callback = cb || noop
    const multi = options.multi !== undefined ? options.multi : false
    const upsert = options.upsert !== undefined ? options.upsert : false

    async
      .waterfall([
        function (cb) {
          // If upsert option is set, check whether we need to insert the doc
          if (!upsert) {
            return cb()
          }

          // Need to use an internal function not tied to the executor to avoid deadlock
          const cursor = new Cursor(self, query)
          cursor.limit(1)._exec(function (err, docs) {
            if (err) {
              return callback(err)
            }
            if (docs.length === 1) {
              return cb()
            } else {
              let toBeInserted

              try {
                checkObject(updateQuery)
                // updateQuery is a simple object with no modifier, use it as the document to insert
                toBeInserted = updateQuery
              } catch (e) {
                // updateQuery contains modifiers, use the find query as the base,
                // strip it from all operators and update it according to updateQuery
                try {
                  toBeInserted = modify(deepCopy(query, true), updateQuery)
                } catch (err) {
                  return callback(err)
                }
              }

              return self._insert(toBeInserted, function (err, newDoc) {
                if (err) {
                  return callback(err)
                }
                return callback(null, 1, newDoc, true)
              })
            }
          })
        },
        function () {
          // Perform the update
          let modifiedDoc, createdAt

          const modifications = []

          self.getCandidates(query, function (err, candidates) {
            if (err) {
              return callback(err)
            }

            // Preparing update (if an error is thrown here neither the datafile nor
            // the in-memory indexes are affected)
            try {
              for (i = 0; i < candidates.length; i += 1) {
                if (
                  match(candidates[i], query) &&
                  (multi || numReplaced === 0)
                ) {
                  numReplaced += 1
                  if (self.timestampData) {
                    createdAt = candidates[i].createdAt
                  }
                  modifiedDoc = modify(candidates[i], updateQuery)
                  if (self.timestampData) {
                    modifiedDoc.createdAt = createdAt
                    modifiedDoc.updatedAt = new Date()
                  }
                  modifications.push({
                    oldDoc: candidates[i],
                    newDoc: modifiedDoc,
                  })
                }
              }
            } catch (err) {
              return callback(err)
            }

            // Change the docs in memory
            try {
              self.updateIndexes(modifications)
            } catch (err) {
              return callback(err)
            }

            // Update the datafile
            const updatedDocs = pluck(modifications, 'newDoc')
            self.persistence.persistNewState(updatedDocs, function (err) {
              if (err) {
                return callback(err)
              }
              if (!options.returnUpdatedDocs) {
                return callback(null, numReplaced)
              } else {
                let updatedDocsDC = []
                updatedDocs.forEach(function (doc) {
                  updatedDocsDC.push(deepCopy(doc))
                })
                if (!multi) {
                  updatedDocsDC = updatedDocsDC[0]
                }
                return callback(null, numReplaced, updatedDocsDC)
              }
            })
          })
        },
      ])
      .catch(console.error)
  }

  update(...args) {
    this.executor.push({ this: this, fn: this._update, arguments: args })
  }

  /**
   * Remove all docs matching the query
   * For now very naive implementation (similar to update)
   * @param {Object} query
   * @param {Object} options Optional options
   *                 options.multi If true, can update multiple documents (defaults to false)
   * @param {Function} cb Optional callback, signature: err, numRemoved
   *
   * @api private Use Datastore.remove which has the same signature
   */
  _remove(query, options, cb) {
    let numRemoved = 0

    const self = this
    const removedDocs = []

    if (typeof options === 'function') {
      cb = options
      options = {}
    }
    const callback = cb || noop
    const multi = options.multi !== undefined ? options.multi : false

    this.getCandidates(query, true, function (err, candidates) {
      if (err) {
        return callback(err)
      }

      try {
        candidates.forEach(function (d) {
          if (match(d, query) && (multi || numRemoved === 0)) {
            numRemoved += 1
            removedDocs.push({ $$deleted: true, _id: d._id })
            self.removeFromIndexes(d)
          }
        })
      } catch (err) {
        return callback(err)
      }

      self.persistence.persistNewState(removedDocs, function (err) {
        if (err) {
          return callback(err)
        }
        return callback(null, numRemoved)
      })
    })
  }

  remove(...args) {
    this.executor.push({ this: this, fn: this._remove, arguments: args })
  }
}

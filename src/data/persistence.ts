/**
 * Handle every persistence-related task
 * The interface Datastore expects to be implemented is
 * * Persistence.loadDatabase(callback) and callback has signature err
 * * Persistence.persistNewState(newDocs, callback) where newDocs is an array of documents and callback has signature err
 */

import path from 'path'

import async from 'async'

import { Index } from './indexes'
import { deserialize, serialize } from './serialization'
import { uid } from './custom-utils'
import { Storage } from './storage'
import { noop } from 'lodash'
import { Collection } from './collection'

type Options = {
  db: Collection
  corruptAlertThreshold?: number
  afterSerialization?: (s: string) => string
  beforeDeserialization?: (s: string) => string
}

export class Persistence {
  db: Collection
  inMemoryOnly: boolean
  filename: string
  corruptAlertThreshold: number

  afterSerialization: (s: string) => string

  beforeDeserialization: (s: string) => string

  autocompactionIntervalId: NodeJS.Timeout | null

  /**
   * Create a new Persistence object for database options.db
   * @param {Collection} options.db
   * @param {Boolean} options.nodeWebkitAppName Optional, specify the name of your NW app if you want options.filename to be relative to the directory where
   *                                            Node Webkit stores application data such as cookies and local storage (the best place to store data in my opinion)
   */
  constructor(options?: Options) {
    let i, j, randomString

    this.db = options.db
    this.inMemoryOnly = this.db.inMemoryOnly
    this.filename = this.db.filename
    this.corruptAlertThreshold =
      options.corruptAlertThreshold !== undefined
        ? options.corruptAlertThreshold
        : 0.1

    if (
      !this.inMemoryOnly &&
      this.filename &&
      this.filename.charAt(this.filename.length - 1) === '~'
    ) {
      throw new Error(
        "The datafile name can't end with a ~, which is reserved for crash safe backup files",
      )
    }

    // After serialization and before deserialization hooks with some basic sanity checks
    if (options.afterSerialization && !options.beforeDeserialization) {
      throw new Error(
        'Serialization hook defined but deserialization hook undefined, cautiously refusing to start NeDB to prevent dataloss',
      )
    }
    if (!options.afterSerialization && options.beforeDeserialization) {
      throw new Error(
        'Serialization hook undefined but deserialization hook defined, cautiously refusing to start NeDB to prevent dataloss',
      )
    }
    this.afterSerialization =
      options.afterSerialization ||
      function (s) {
        return s
      }
    this.beforeDeserialization =
      options.beforeDeserialization ||
      function (s) {
        return s
      }

    for (i = 1; i < 30; i += 1) {
      for (j = 0; j < 10; j += 1) {
        randomString = uid(i)
        if (
          this.beforeDeserialization(this.afterSerialization(randomString)) !==
          randomString
        ) {
          throw new Error(
            'beforeDeserialization is not the reverse of afterSerialization, cautiously refusing to start NeDB to prevent dataloss',
          )
        }
      }
    }
  }

  /**
   * Check if a directory exists and create it on the fly if it is not the case
   * cb is optional, signature: err
   */
  static ensureDirectoryExists(dir, cb) {
    const callback = cb || noop
    Storage.mkdirp(dir)
      .then(result => cb(null, result))
      .catch(callback)
  }

  /**
   * Persist cached database
   * This serves as a compaction function since the cache always contains only the number of documents in the collection
   * while the data file is append-only so it may grow larger
   * @param {Function} cb Optional callback, signature: err
   */
  persistCachedDatabase(cb) {
    const callback = cb || noop
    const self = this
    let toPersist = ''

    if (this.inMemoryOnly) {
      return callback(null)
    }

    this.db.getAllData().forEach(function (doc) {
      toPersist += self.afterSerialization(serialize(doc)) + '\n'
    })
    Object.keys(this.db.indexes).forEach(function (fieldName) {
      if (fieldName != '_id') {
        // The special _id index is managed by datastore.js, the others need to be persisted
        toPersist +=
          self.afterSerialization(
            serialize({
              $$indexCreated: {
                fieldName: fieldName,
                unique: self.db.indexes[fieldName].unique,
                sparse: self.db.indexes[fieldName].sparse,
              },
            }),
          ) + '\n'
      }
    })

    Storage.crashSafeWriteFile(this.filename, toPersist, function (err) {
      if (err) {
        return callback(err)
      }
      self.db.emit('compaction.done')
      return callback(null)
    })
  }

  /**
   * Queue a rewrite of the datafile
   */
  compactDatafile() {
    this.db.executor.push({
      this: this,
      fn: this.persistCachedDatabase,
      arguments: [],
    })
  }

  /**
   * Set automatic compaction every interval ms
   * @param {Number} interval in milliseconds, with an enforced minimum of 5 seconds
   */
  setAutocompactionInterval(interval) {
    const self = this,
      minInterval = 5000,
      realInterval = Math.max(interval || 0, minInterval)
    this.stopAutocompaction()

    this.autocompactionIntervalId = setInterval(function () {
      self.compactDatafile()
    }, realInterval)
  }

  /**
   * Stop autocompaction (do nothing if autocompaction was not running)
   */
  stopAutocompaction() {
    if (this.autocompactionIntervalId) {
      clearInterval(this.autocompactionIntervalId)
    }
  }

  /**
   * Persist new state for the given newDocs (can be insertion, update or removal)
   * Use an append-only format
   * @param {Array} newDocs Can be empty if no doc was updated/removed
   * @param {Function} cb Optional, signature: err
   */
  persistNewState(newDocs, cb) {
    const self = this
    let toPersist = ''
    const callback = cb || noop
    // In-memory only datastore
    if (self.inMemoryOnly) {
      return callback(null)
    }

    newDocs.forEach(function (doc) {
      toPersist += self.afterSerialization(serialize(doc)) + '\n'
    })

    if (toPersist.length === 0) {
      return callback(null)
    }

    Storage.appendFile(self.filename, toPersist, 'utf8', function (err) {
      return callback(err)
    })
  }

  /**
   * From a database's raw data, return the corresponding
   * machine understandable collection
   */
  treatRawData(rawData) {
    const data = rawData.split('\n'),
      dataById = {},
      tdata = [],
      indexes = {}

    let corruptItems = -1 // Last line of every data file is usually blank so not really corrupt

    for (let i = 0; i < data.length; i += 1) {
      let doc

      try {
        doc = deserialize(this.beforeDeserialization(data[i]))
        if (doc._id) {
          if (doc.$$deleted === true) {
            delete dataById[doc._id]
          } else {
            dataById[doc._id] = doc
          }
        } else if (
          doc.$$indexCreated &&
          doc.$$indexCreated.fieldName != undefined
        ) {
          indexes[doc.$$indexCreated.fieldName] = doc.$$indexCreated
        } else if (typeof doc.$$indexRemoved === 'string') {
          delete indexes[doc.$$indexRemoved]
        }
      } catch (e) {
        corruptItems += 1
      }
    }

    // A bit lenient on corruption
    if (
      data.length > 0 &&
      corruptItems / data.length > this.corruptAlertThreshold
    ) {
      throw new Error(
        'More than ' +
          Math.floor(100 * this.corruptAlertThreshold) +
          '% of the data file is corrupt, the wrong beforeDeserialization hook may be used. Cautiously refusing to start NeDB to prevent dataloss',
      )
    }

    Object.keys(dataById).forEach(function (k) {
      tdata.push(dataById[k])
    })

    return { data: tdata, indexes: indexes }
  }

  /**
   * Load the database
   * 1) Create all indexes
   * 2) Insert all data
   * 3) Compact the database
   * This means pulling data out of the data file or creating it if it doesn't exist
   * Also, all data is persisted right away, which has the effect of compacting the database file
   * This operation is very quick at startup for a big collection (60ms for ~10k docs)
   * @param {Function} cb Optional callback, signature: err
   */
  loadDatabase(cb) {
    const callback = cb || noop,
      self = this
    self.db.resetIndexes()

    // In-memory only datastore
    if (self.inMemoryOnly) {
      return callback(null)
    }

    async.waterfall(
      [
        function (cb) {
          Persistence.ensureDirectoryExists(
            path.dirname(self.filename),
            function () {
              Storage.ensureDatafileIntegrity(self.filename, function () {
                Storage.readFile(
                  self.filename,
                  'utf8',
                  function (err, rawData) {
                    if (err) {
                      return cb(err)
                    }

                    let treatedData

                    try {
                      treatedData = self.treatRawData(rawData)
                    } catch (e) {
                      return cb(e)
                    }

                    // Recreate all indexes in the datafile
                    Object.keys(treatedData.indexes).forEach(function (key) {
                      self.db.indexes[key] = new Index(treatedData.indexes[key])
                    })

                    // Fill cached database (i.e. all indexes) with data
                    try {
                      self.db.resetIndexes(treatedData.data)
                    } catch (e) {
                      self.db.resetIndexes() // Rollback any index which didn't fail
                      return cb(e)
                    }

                    self.db.persistence.persistCachedDatabase(cb)
                  },
                )
              })
            },
          )
        },
      ],
      function (err) {
        if (err) {
          return callback(err)
        }

        self.db.executor.processBuffer()
        return callback(null)
      },
    )
  }
}

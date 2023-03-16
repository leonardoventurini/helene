/**
 * Handle every persistence-related task
 * The interface Datastore expects to be implemented is
 * * Persistence.loadDatabase(callback) and callback has signature err
 * * Persistence.persistNewState(newDocs, callback) where newDocs is an array of documents and callback has signature err
 */

import { Index } from './indexes'
import { deserialize, serialize } from './serialization'
import { uid } from './custom-utils'
import { Collection, CollectionEvent } from './collection'
import { IStorage } from './types'
import { defer } from 'lodash'

type Options = {
  db: Collection
  corruptAlertThreshold?: number
  afterSerialization?: (s: string) => string
  beforeDeserialization?: (s: string) => string
}

export class Persistence {
  db: Collection
  inMemoryOnly: boolean
  name: string
  corruptAlertThreshold: number

  afterSerialization: (s: string) => string

  beforeDeserialization: (s: string) => string

  autocompactionIntervalId: NodeJS.Timeout | null

  storage: IStorage

  constructor(options?: Options) {
    let i, j, randomString

    this.db = options.db
    this.inMemoryOnly = this.db.inMemoryOnly
    this.name = this.db.name
    this.corruptAlertThreshold =
      options.corruptAlertThreshold !== undefined
        ? options.corruptAlertThreshold
        : 0.1

    if (
      !this.inMemoryOnly &&
      this.name &&
      this.name.charAt(this.name.length - 1) === '~'
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

  async loadDatabase() {
    this.db.resetIndexes()

    if (this.inMemoryOnly) {
      return null
    }

    const rawData = await this.storage.read(this.name)

    const treatedData = this.treatRawData(rawData)

    // Recreate all indexes in the datafile
    Object.keys(treatedData.indexes).forEach(key => {
      this.db.indexes[key] = new Index(treatedData.indexes[key])
    })

    // Fill cached database (i.e. all indexes) with data
    try {
      this.db.resetIndexes(treatedData.data)
    } catch (e) {
      this.db.resetIndexes() // Rollback any index which didn't fail
      throw e
    }

    await this.persistCachedDatabase()
  }

  /**
   * This is the entry-point.
   */
  async persistNewState(newDocs) {
    const self = this
    let toPersist = ''

    defer(() => {
      this.db.emit(CollectionEvent.UPDATED, newDocs)
    })

    // In-memory only datastore
    if (self.inMemoryOnly) {
      return null
    }

    newDocs.forEach(function (doc) {
      toPersist += self.afterSerialization(serialize(doc)) + '\n'
    })

    if (toPersist.length === 0) {
      return null
    }

    await this.storage.append(self.name, toPersist)
  }

  async persistCachedDatabase() {
    const self = this
    let toPersist = ''

    if (this.inMemoryOnly) {
      return null
    }

    this.db.getAllData().forEach(doc => {
      toPersist += this.afterSerialization(serialize(doc)) + '\n'
    })

    Object.keys(this.db.indexes).forEach(fieldName => {
      if (fieldName != '_id') {
        // The special _id index is managed by Collection, the others need to be persisted
        toPersist +=
          self.afterSerialization(
            serialize({
              $$indexCreated: {
                fieldName: fieldName,
                unique: this.db.indexes[fieldName].unique,
                sparse: this.db.indexes[fieldName].sparse,
              },
            }),
          ) + '\n'
      }
    })

    await this.storage.write(this.name, toPersist)

    this.db.emit(CollectionEvent.COMPACTED)
  }

  /**
   * Queue a rewrite of the datafile
   */
  async compactDatafile() {
    return this.persistCachedDatabase()
  }

  /**
   * Set automatic compaction every interval ms
   * @param {Number} interval in milliseconds, with an enforced minimum of 5 seconds
   */
  setAutocompactionInterval(interval) {
    const minInterval = 5000
    const realInterval = Math.max(interval || 0, minInterval)

    this.stopAutocompaction()

    this.autocompactionIntervalId = setInterval(() => {
      this.compactDatafile().catch(console.error)
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
   * From a database's raw data, return the corresponding
   * machine understandable collection
   */
  treatRawData(rawData) {
    const data = rawData.split('\n'),
      dataById = {},
      tdata = [],
      indexes: Record<string, any> = {}

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

    return { data: tdata, indexes }
  }
}

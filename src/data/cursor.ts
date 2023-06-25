import { compareThings, getDotValue, match, modify } from './model'

/**
 * Manage access to data, be it to find, update or remove it
 */
import { isEmpty, omit } from 'lodash'
import { Collection } from './collection'

export type Query = {
  [key: string]: any
}

export type ExecFn = (data: any) => Promise<any>

export class Cursor implements PromiseLike<any[]> {
  db: Collection

  query: Query

  execFn: ExecFn

  _limit: number

  _skip: number

  _sort: any

  _projection: any

  /**
   * Create a new cursor for this collection
   * @param {Collection} db - The datastore this cursor is bound to
   * @param {Query} query - The query this cursor will operate on
   * @param {Function} execFn - Handler to be executed after cursor has found the results and before the callback passed to find/findOne/update/remove
   */
  constructor(db, query?: Query, execFn?: ExecFn) {
    this.db = db
    this.query = query || {}
    if (execFn) {
      this.execFn = execFn
    }
  }

  /**
   * Set a limit to the number of results
   */
  limit(limit) {
    this._limit = limit
    return this
  }

  /**
   * Skip the number of results
   */
  skip(skip) {
    this._skip = skip
    return this
  }

  /**
   * Sort results of the query
   * @param {SortQuery} sortQuery - SortQuery is { field: order }, field can use the dot-notation, order is 1 for ascending and -1 for descending
   */
  sort(sortQuery) {
    this._sort = sortQuery
    return this
  }

  /**
   * Add the use of a projection
   * @param {Object} projection - MongoDB-style projection. {} means take all fields. Then it's { key1: 1, key2: 1 } to take only key1 and key2
   *                              { key1: 0, key2: 0 } to omit only key1 and key2. Except _id, you can't mix takes and omits
   */
  projection(projection) {
    this._projection = projection
    return this
  }

  /**
   * Apply the projection
   */
  project(candidates) {
    const res = []
    let action

    if (isEmpty(this._projection)) {
      return candidates
    }

    const keepId = this._projection._id !== 0

    this._projection = omit(this._projection, '_id')

    // Check for consistency
    const keys = Object.keys(this._projection)

    for (const k of keys) {
      if (action !== undefined && this._projection[k] !== action) {
        throw new Error("Can't both keep and omit fields except for _id")
      }
      action = this._projection[k]
    }

    // Do the actual projection
    for (const candidate of candidates) {
      let toPush

      if (action === 1) {
        // pick-type projection
        toPush = { $set: {} }
        for (const k of keys) {
          const value = getDotValue(candidate, k)

          if (value !== undefined) {
            toPush.$set[k] = value
          }
        }
        toPush = modify({}, toPush)
      } else {
        // omit-type projection
        toPush = { $unset: {} }
        for (const k of keys) {
          toPush.$unset[k] = true
        }
        toPush = modify(candidate, toPush)
      }

      if (keepId) {
        toPush._id = candidate._id
      } else {
        delete toPush._id
      }

      res.push(toPush)
    }

    return res
  }

  /**
   * Get all matching elements
   * Will return pointers to matched elements (shallow copies), returning full copies is the role of find or findOne
   * This is an internal function, use exec which uses the executor
   */
  async exec(): Promise<any[]> {
    let res = [],
      added = 0,
      skipped = 0,
      i,
      keys,
      key

    const self = this

    const candidates = await this.db.getCandidates(this.query)

    for (i = 0; i < candidates.length; i += 1) {
      if (match(candidates[i], self.query)) {
        // If a sort is defined, wait for the results to be sorted before applying limit and skip
        if (!self._sort) {
          if (self._skip && self._skip > skipped) {
            skipped += 1
          } else {
            res.push(candidates[i])
            added += 1
            if (self._limit && self._limit <= added) {
              break
            }
          }
        } else {
          res.push(candidates[i])
        }
      }
    }

    // Apply all sorts
    if (self._sort) {
      keys = Object.keys(self._sort)

      // Sorting
      const criteria = []

      for (i = 0; i < keys.length; i++) {
        key = keys[i]
        criteria.push({ key: key, direction: self._sort[key] })
      }

      res.sort(function (a, b) {
        let criterion, compare, i
        for (i = 0; i < criteria.length; i++) {
          criterion = criteria[i]
          compare =
            criterion.direction *
            compareThings(
              getDotValue(a, criterion.key),
              getDotValue(b, criterion.key),
              self.db.compareStrings,
            )
          if (compare !== 0) {
            return compare
          }
        }
        return 0
      })

      // Applying limit and skip
      const limit = self._limit || res.length,
        skip = self._skip || 0

      res = res.slice(skip, skip + limit)
    }

    res = self.project(res)

    if (this.execFn) {
      res = await this.execFn(res)
    }

    return res
  }

  async map(fn) {
    const res = await this.exec()

    const ret = []

    for (const item of res) {
      ret.push(await fn(item))
    }

    return ret
  }

  then<TResult1 = any[], TResult2 = never>(
    onfulfilled?:
      | ((value: any[]) => PromiseLike<TResult1> | TResult1)
      | undefined
      | null,
    onrejected?:
      | ((reason: any) => PromiseLike<TResult2> | TResult2)
      | undefined
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected)
  }
}

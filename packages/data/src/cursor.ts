import { compareThings, getDotValue, match, modify } from './model'
import isEmpty from 'lodash/isEmpty'
import omit from 'lodash/omit'
import { BaseDocument, Collection } from './collection'

export type Query = {
  [key: string]: any
}

export type SortQuery = {
  [key: string]: 1 | -1
}

export type Projection = {
  [key: string]: 0 | 1
}

export type ExecFn = (data: any) => Promise<any>

export class Cursor<T extends BaseDocument = BaseDocument>
  implements PromiseLike<T[]>
{
  db: Collection

  query: Query

  execFn: ExecFn

  _limit: number

  _skip: number

  _sort: any

  _projection: any

  constructor(db: Collection, query?: Query, execFn?: ExecFn) {
    this.db = db
    this.query = query || {}
    if (execFn) {
      this.execFn = execFn
    }
  }

  limit(limit: number) {
    this._limit = limit
    return this
  }

  skip(skip: number) {
    this._skip = skip
    return this
  }

  sort(sortQuery: SortQuery) {
    this._sort = sortQuery
    return this
  }

  projection(projection: Projection) {
    this._projection = projection
    return this
  }

  project(candidates: any[]) {
    const res = []

    let action: number

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
      let toPush: { $set?: any; $unset?: any; _id?: any }

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
        let criterion: { direction: number; key: any },
          compare: number,
          i: number
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

  then<TResult1 = T[], TResult2 = never>(
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

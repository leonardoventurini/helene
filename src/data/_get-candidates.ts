// STEP 1: get candidates list by checking indexes from most to least frequent usecase
import _, { isDate, isObject } from 'lodash'

export async function checkIndexesFromMostToLeast(query, indexNames) {
  // For a basic match
  let usableQueryKeys = []
  Object.keys(query).forEach(function (k) {
    if (
      typeof query[k] === 'string' ||
      typeof query[k] === 'number' ||
      typeof query[k] === 'boolean' ||
      isDate(query[k]) ||
      query[k] === null
    ) {
      usableQueryKeys.push(k)
    }
  })
  usableQueryKeys = _.intersection(usableQueryKeys, indexNames)

  if (usableQueryKeys.length > 0) {
    return this.indexes[usableQueryKeys[0]].getMatching(
      query[usableQueryKeys[0]],
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
    return this.indexes[usableQueryKeys[0]].getMatching(
      query[usableQueryKeys[0]].$in,
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
    return this.indexes[usableQueryKeys[0]].getBetweenBounds(
      query[usableQueryKeys[0]],
    )
  }

  // By default, return all the DB data
  return this.getAllData()
}

export async function removeExpiredDocuments(docs, dontExpireStaleDocs) {
  if (dontExpireStaleDocs) {
    return docs
  }

  const expiredDocsIds = [],
    validDocs = [],
    ttlIndexesFieldNames = Object.keys(this.ttlIndexes)

  docs.forEach(doc => {
    let valid = true
    ttlIndexesFieldNames.forEach(i => {
      if (
        doc[i] !== undefined &&
        isDate(doc[i]) &&
        Date.now() > doc[i].getTime() + this.ttlIndexes[i] * 1000
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

  try {
    for (const _id of expiredDocsIds) {
      await this._remove({ _id: _id })
    }

    return validDocs
  } catch {
    return validDocs
  }
}

import isDate from 'lodash/isDate'
import isObject from 'lodash/isObject'

export async function checkIndexesFromMostToLeast(query, indexNames) {
  const queryKeys = Object.keys(query)
  const indexSet = new Set(indexNames)

  const usableQueryKeys = {
    basic: [],
    inMatch: [],
    comparison: [],
  }

  queryKeys.forEach(k => {
    const value = query[k]

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      isDate(value) ||
      value === null
    ) {
      if (indexSet.has(k)) usableQueryKeys.basic.push(k)
    } else if (isObject(value)) {
      if ('$in' in value && indexSet.has(k)) usableQueryKeys.inMatch.push(k)
      if (
        ['$lt', '$lte', '$gt', '$gte'].some(m => m in value) &&
        indexSet.has(k)
      ) {
        usableQueryKeys.comparison.push(k)
      }
    }
  })

  // Basic match
  if (usableQueryKeys.basic.length > 0) {
    return this.indexes[usableQueryKeys.basic[0]].getMatching(
      query[usableQueryKeys.basic[0]],
    )
  }

  // $in match
  if (usableQueryKeys.inMatch.length > 0) {
    return this.indexes[usableQueryKeys.inMatch[0]].getMatching(
      query[usableQueryKeys.inMatch[0]].$in,
    )
  }

  // Comparison match
  if (usableQueryKeys.comparison.length > 0) {
    return this.indexes[usableQueryKeys.comparison[0]].getBetweenBounds(
      query[usableQueryKeys.comparison[0]],
    )
  }

  // By default, return all the DB data
  return this.getAllData()
}

export async function removeExpiredDocuments(docs, dontExpireStaleDocs) {
  if (dontExpireStaleDocs) {
    return docs
  }

  const expiredDocsIds = []
  const validDocs = []
  const ttlIndexesFieldNames = Object.keys(this.ttlIndexes)

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

  for (const _id of expiredDocsIds) {
    await this.remove({ _id: _id })
  }

  return validDocs
}

import { areComparable, areThingsEqual, match } from './model'
import isRegExp from 'lodash/isRegExp'

export const ComparisonFunctions = {
  /**
   * Arithmetic and comparison operators
   */
  $lt: function (a, b) {
    return areComparable(a, b) && a < b
  },
  $lte: function (a, b) {
    return areComparable(a, b) && a <= b
  },
  $gt: function (a, b) {
    return areComparable(a, b) && a > b
  },
  $gte: function (a, b) {
    return areComparable(a, b) && a >= b
  },
  $ne: function (a, b) {
    if (a === undefined) {
      return true
    }
    return !areThingsEqual(a, b)
  },
  $in: function (a, b) {
    let i

    if (!Array.isArray(b)) {
      throw new Error('$in operator called with a non-array')
    }

    for (i = 0; i < b.length; i += 1) {
      if (areThingsEqual(a, b[i])) {
        return true
      }
    }

    return false
  },
  $nin: function (a, b) {
    if (!Array.isArray(b)) {
      throw new Error('$nin operator called with a non-array')
    }

    return !ComparisonFunctions.$in(a, b)
  },
  $regex: function (a, b) {
    if (!isRegExp(b)) {
      throw new Error('$regex operator called with non regular expression')
    }

    if (typeof a !== 'string') {
      return false
    } else {
      return b.test(a)
    }
  },
  $exists: function (value, exists) {
    exists = exists || exists === ''

    if (value === undefined) {
      return !exists
    } else {
      return exists
    }
  },
  $size: function (obj, value) {
    if (!Array.isArray(obj)) {
      return false
    }
    if (value % 1 !== 0) {
      throw new Error('$size operator called without an integer')
    }

    return obj.length == value
  },
  $elemMatch: function (obj, value) {
    if (!Array.isArray(obj)) {
      return false
    }
    let i = obj.length
    let result = false
    while (i--) {
      if (match(obj[i], value)) {
        // If match for array element, return true
        result = true
        break
      }
    }
    return result
  },
}

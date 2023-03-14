import _, { isArray } from 'lodash'
import { compareThings, match } from './model'

/**
 * The signature of modifier functions is as follows
 * Their structure is always the same: recursively follow the dot notation while creating
 * the nested documents if needed, then apply the "last step modifier"
 */
export const LastStepModifierFunctions = {
  /**
   * Set a field to a new value
   */
  $set: function (obj, field, value) {
    obj[field] = value
  },

  /**
   * Unset a field
   */
  $unset: function (obj, field, value) {
    delete obj[field]
  },

  /**
   * Push an element to the end of an array field
   * Optional modifier $each instead of value to push several values
   * Optional modifier $slice to slice the resulting array, see https://docs.mongodb.org/manual/reference/operator/update/slice/
   * Différeence with MongoDB: if $slice is specified and not $each, we act as if value is an empty array
   */
  $push: function (obj, field, value) {
    // Create the array if it doesn't exist
    if (!(field in obj)) {
      obj[field] = []
    }

    if (!isArray(obj[field])) {
      throw new Error("Can't $push an element on non-array values")
    }

    if (
      value !== null &&
      typeof value === 'object' &&
      value.$slice &&
      value.$each === undefined
    ) {
      value.$each = []
    }

    if (value !== null && typeof value === 'object' && value.$each) {
      if (
        Object.keys(value).length >= 3 ||
        (Object.keys(value).length === 2 && value.$slice === undefined)
      ) {
        throw new Error(
          'Can only use $slice in cunjunction with $each when $push to array',
        )
      }
      if (!isArray(value.$each)) {
        throw new Error('$each requires an array value')
      }

      value.$each.forEach(function (v) {
        obj[field].push(v)
      })

      if (value.$slice === undefined || typeof value.$slice !== 'number') {
        return
      }

      if (value.$slice === 0) {
        obj[field] = []
      } else {
        let start, end
        const n = obj[field].length
        if (value.$slice < 0) {
          start = Math.max(0, n + value.$slice)
          end = n
        } else if (value.$slice > 0) {
          start = 0
          end = Math.min(n, value.$slice)
        }
        obj[field] = obj[field].slice(start, end)
      }
    } else {
      obj[field].push(value)
    }
  },

  /**
   * Add an element to an array field only if it is not already in it
   * No modification if the element is already in the array
   * Note that it doesn't check whether the original array contains duplicates
   */
  $addToSet: function (obj, field, value) {
    let addToSet = true

    // Create the array if it doesn't exist
    if (!(field in obj)) {
      obj[field] = []
    }

    if (!isArray(obj[field])) {
      throw new Error("Can't $addToSet an element on non-array values")
    }

    if (value !== null && typeof value === 'object' && value.$each) {
      if (Object.keys(value).length > 1) {
        throw new Error("Can't use another field in conjunction with $each")
      }
      if (!isArray(value.$each)) {
        throw new Error('$each requires an array value')
      }

      value.$each.forEach(function (v) {
        LastStepModifierFunctions.$addToSet(obj, field, v)
      })
    } else {
      obj[field].forEach(function (v) {
        if (compareThings(v, value) === 0) {
          addToSet = false
        }
      })
      if (addToSet) {
        obj[field].push(value)
      }
    }
  },

  /**
   * Remove the first or last element of an array
   */
  $pop: function (obj, field, value) {
    if (!isArray(obj[field])) {
      throw new Error("Can't $pop an element from non-array values")
    }

    if (typeof value !== 'number') {
      throw new Error(value + " isn't an integer, can't use it with $pop")
    }

    if (value === 0) {
      return
    }

    if (value > 0) {
      obj[field] = obj[field].slice(0, obj[field].length - 1)
    } else {
      obj[field] = obj[field].slice(1)
    }
  },

  /**
   * Removes all instances of a value from an existing array
   */
  $pull: function (obj, field, value) {
    let i

    if (!isArray(obj[field])) {
      throw new Error("Can't $pull an element from non-array values")
    }

    const arr = obj[field]
    for (i = arr.length - 1; i >= 0; i -= 1) {
      if (match(arr[i], value)) {
        arr.splice(i, 1)
      }
    }
  },

  /**
   * Increment a numeric field's value
   */
  $inc: function (obj, field, value) {
    if (typeof value !== 'number') {
      throw new Error(value + ' must be a number')
    }

    if (typeof obj[field] !== 'number') {
      if (!_.has(obj, field)) {
        obj[field] = value
      } else {
        throw new Error("Don't use the $inc modifier on non-number fields")
      }
    } else {
      obj[field] += value
    }
  },

  /**
   * Updates the value of the field, only if specified field is greater than the current value of the field
   */
  $max: function (obj, field, value) {
    if (typeof obj[field] === 'undefined') {
      obj[field] = value
    } else if (value > obj[field]) {
      obj[field] = value
    }
  },

  /**
   * Updates the value of the field, only if specified field is smaller than the current value of the field
   */
  $min: function (obj, field, value) {
    if (typeof obj[field] === 'undefined') {
      obj[field] = value
    } else if (value < obj[field]) {
      obj[field] = value
    }
  },
}

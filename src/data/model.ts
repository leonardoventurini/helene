/**
 * Handle models (i.e. docs)
 * Serialization/deserialization
 * Copying
 * Querying, update
 */

import _, { isArray, isDate, isNull, isObject, isRegExp } from 'lodash'
import { ComparisonFunctions } from './comparison-functions'
import { LastStepModifierFunctions } from './last-step-modifier-functions'
import { LogicalOperators } from './logical-operators'

const modifierFunctions = {},
  arrayComparisonFunctions = {
    $size: true,
    $elemMatch: true,
  }

/**
 * Check a key, throw an error if the key is non valid
 * @param {String} k key
 * @param {Model} v value, needed to treat the Date edge case
 * Non-treatable edge cases here: if part of the object if of the form { $$date: number } or { $$deleted: true }
 * Its serialized-then-deserialized version it will transformed into a Date object
 * But you really need to want it to trigger such behaviour, even when warned not to use '$' at the beginning of the field names...
 */
export function checkKey(k, v) {
  if (typeof k === 'number') {
    k = k.toString()
  }

  if (
    k[0] === '$' &&
    !(k === '$$date' && typeof v === 'number') &&
    !(k === '$$deleted' && v === true) &&
    !(k === '$$indexCreated') &&
    !(k === '$$indexRemoved')
  ) {
    throw new Error('Field names cannot begin with the $ character')
  }

  if (k.indexOf('.') !== -1) {
    throw new Error('Field names cannot contain a .')
  }
}

/**
 * Check a DB object and throw an error if it's not valid
 * Works by applying the above checkKey function to all fields recursively
 */
export function checkObject(obj) {
  if (isArray(obj)) {
    obj.forEach(function (o) {
      checkObject(o)
    })
  }

  if (typeof obj === 'object' && obj !== null) {
    Object.keys(obj).forEach(function (k) {
      checkKey(k, obj[k])
      checkObject(obj[k])
    })
  }
}

/**
 * Deep copy a DB object
 * The optional strictKeys flag (defaulting to false) indicates whether to copy everything or only fields
 * where the keys are valid, i.e. don't begin with $ and don't contain a .
 */
export function deepCopy(obj, strictKeys = false) {
  let res

  if (
    typeof obj === 'boolean' ||
    typeof obj === 'number' ||
    typeof obj === 'string' ||
    obj === null ||
    isDate(obj)
  ) {
    return obj
  }

  if (isArray(obj)) {
    res = []
    obj.forEach(function (o) {
      res.push(deepCopy(o, strictKeys))
    })
    return res
  }

  if (typeof obj === 'object') {
    res = {}
    Object.keys(obj).forEach(function (k) {
      if (!strictKeys || (k[0] !== '$' && k.indexOf('.') === -1)) {
        res[k] = deepCopy(obj[k], strictKeys)
      }
    })
    return res
  }

  return undefined // For now everything else is undefined. We should probably throw an error instead
}

/**
 * Tells if an object is a primitive type or a "real" object
 * Arrays are considered primitive
 */
export function isPrimitiveType(obj) {
  return (
    typeof obj === 'boolean' ||
    typeof obj === 'number' ||
    typeof obj === 'string' ||
    obj === null ||
    isDate(obj) ||
    isArray(obj)
  )
}

/**
 * Utility functions for comparing things
 * Assumes type checking was already done (a and b already have the same type)
 * compareNSB works for numbers, strings and booleans
 */
function compareNSB(a, b) {
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
}

function compareArrays(a, b) {
  let i, comp

  for (i = 0; i < Math.min(a.length, b.length); i += 1) {
    comp = compareThings(a[i], b[i])

    if (comp !== 0) {
      return comp
    }
  }

  // Common section was identical, longest one wins
  return compareNSB(a.length, b.length)
}

/**
 * Compare { things U undefined }
 * Things are defined as any native types (string, number, boolean, null, date) and objects
 * We need to compare with undefined as it will be used in indexes
 * In the case of objects and arrays, we deep-compare
 * If two objects dont have the same type, the (arbitrary) type hierarchy is: undefined, null, number, strings, boolean, dates, arrays, objects
 * Return -1 if a < b, 1 if a > b and 0 if a = b (note that equality here is NOT the same as defined in areThingsEqual!)
 *
 * @param a
 * @param b
 * @param {Function} _compareStrings String comparing function, returning -1, 0 or 1, overriding default string comparison (useful for languages with accented letters)
 */
export function compareThings(
  a,
  b,
  _compareStrings?: (a: string, b: string) => -1 | 0 | 1,
) {
  let comp, i

  const compareStrings = _compareStrings || compareNSB

  // undefined
  if (a === undefined) {
    return b === undefined ? 0 : -1
  }

  if (b === undefined) {
    return 1
  }

  // null
  if (a === null) {
    return b === null ? 0 : -1
  }

  if (b === null) {
    return 1
  }

  // Numbers
  if (typeof a === 'number') {
    return typeof b === 'number' ? compareNSB(a, b) : -1
  }
  if (typeof b === 'number') {
    return typeof a === 'number' ? compareNSB(a, b) : 1
  }

  // Strings
  if (typeof a === 'string') {
    return typeof b === 'string' ? compareStrings(a, b) : -1
  }
  if (typeof b === 'string') {
    return typeof a === 'string' ? compareStrings(a, b) : 1
  }

  // Booleans
  if (typeof a === 'boolean') {
    return typeof b === 'boolean' ? compareNSB(a, b) : -1
  }
  if (typeof b === 'boolean') {
    return typeof a === 'boolean' ? compareNSB(a, b) : 1
  }

  // Dates
  if (isDate(a)) {
    return isDate(b) ? compareNSB(a.getTime(), b.getTime()) : -1
  }
  if (isDate(b)) {
    return isDate(a) ? compareNSB(a.getTime(), b.getTime()) : 1
  }

  // Arrays (first element is most significant and so on)
  if (isArray(a)) {
    return isArray(b) ? compareArrays(a, b) : -1
  }
  if (isArray(b)) {
    return isArray(a) ? compareArrays(a, b) : 1
  }

  // Objects
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()

  for (i = 0; i < Math.min(aKeys.length, bKeys.length); i += 1) {
    comp = compareThings(a[aKeys[i]], b[bKeys[i]])

    if (comp !== 0) {
      return comp
    }
  }

  return compareNSB(aKeys.length, bKeys.length)
}

// ==============================================================
// Updating documents
// ==============================================================

// Given its name, create the complete modifier function
function createModifierFunction(modifier) {
  return function (obj, field, value) {
    const fieldParts = typeof field === 'string' ? field.split('.') : field

    if (fieldParts.length === 1) {
      LastStepModifierFunctions[modifier](obj, field, value)
    } else {
      if (obj[fieldParts[0]] === undefined) {
        if (modifier === '$unset') {
          return
        } // Bad looking specific fix, needs to be generalized modifiers that behave like $unset are implemented
        obj[fieldParts[0]] = {}
      }

      const nextObj = obj[fieldParts[0]]

      if (isNull(nextObj) || !isObject(nextObj)) {
        return
      }

      modifierFunctions[modifier](nextObj, fieldParts.slice(1), value)
    }
  }
}

// Actually create all modifier functions
Object.keys(LastStepModifierFunctions).forEach(function (modifier) {
  modifierFunctions[modifier] = createModifierFunction(modifier)
})

/**
 * Modify a DB object according to an update query
 */
export function modify(obj, updateQuery) {
  const keys = Object.keys(updateQuery),
    firstChars = _.map(keys, function (item) {
      return item[0]
    }),
    dollarFirstChars = _.filter(firstChars, function (c) {
      return c === '$'
    })
  let newDoc, modifiers

  if (keys.indexOf('_id') !== -1 && updateQuery._id !== obj._id) {
    throw new Error("You cannot change a document's _id")
  }

  if (
    dollarFirstChars.length !== 0 &&
    dollarFirstChars.length !== firstChars.length
  ) {
    throw new Error('You cannot mix modifiers and normal fields')
  }

  if (dollarFirstChars.length === 0) {
    // Simply replace the object with the update query contents
    newDoc = deepCopy(updateQuery)
    newDoc._id = obj._id
  } else {
    // Apply modifiers
    modifiers = _.uniq(keys)
    newDoc = deepCopy(obj)
    modifiers.forEach(function (m) {
      if (!modifierFunctions[m]) {
        throw new Error('Unknown modifier ' + m)
      }

      // Can't rely on Object.keys throwing on non objects since ES6
      // Not 100% satisfying as non objects can be interpreted as objects but no false negatives so we can live with it
      if (typeof updateQuery[m] !== 'object') {
        throw new Error('Modifier ' + m + "'s argument must be an object")
      }

      const keys = Object.keys(updateQuery[m])

      keys.forEach(function (k) {
        modifierFunctions[m](newDoc, k, updateQuery[m][k])
      })
    })
  }

  // Check result is valid and return it
  checkObject(newDoc)

  if (obj._id !== newDoc._id) {
    throw new Error("You can't change a document's _id")
  }
  return newDoc
}

// ==============================================================
// Finding documents
// ==============================================================

/**
 * Get a value from object with dot notation
 * @param {Object} obj
 * @param {String} field
 */
export function getDotValue(obj, field) {
  const fieldParts = typeof field === 'string' ? field.split('.') : field
  let i, objs

  if (!obj) {
    return undefined
  } // field cannot be empty so that means we should return undefined so that nothing can match

  if (fieldParts.length === 0) {
    return obj
  }

  if (fieldParts.length === 1) {
    return obj[fieldParts[0]]
  }

  if (isArray(obj[fieldParts[0]])) {
    // If the next field is an integer, return only this item of the array
    i = parseInt(fieldParts[1], 10)
    if (typeof i === 'number' && !isNaN(i)) {
      return getDotValue(obj[fieldParts[0]][i], fieldParts.slice(2))
    }

    // Return the array of values
    objs = []
    for (i = 0; i < obj[fieldParts[0]].length; i += 1) {
      objs.push(getDotValue(obj[fieldParts[0]][i], fieldParts.slice(1)))
    }
    return objs
  } else {
    return getDotValue(obj[fieldParts[0]], fieldParts.slice(1))
  }
}

/**
 * Check whether 'things' are equal
 * Things are defined as any native types (string, number, boolean, null, date) and objects
 * In the case of object, we check deep equality
 * Returns true if they are, false otherwise
 */
export function areThingsEqual(a, b) {
  let aKeys, bKeys, i

  // Strings, booleans, numbers, null
  if (
    a === null ||
    typeof a === 'string' ||
    typeof a === 'boolean' ||
    typeof a === 'number' ||
    b === null ||
    typeof b === 'string' ||
    typeof b === 'boolean' ||
    typeof b === 'number'
  ) {
    return a === b
  }

  // Dates
  if (isDate(a) || isDate(b)) {
    return isDate(a) && isDate(b) && a.getTime() === b.getTime()
  }

  // Arrays (no match since arrays are used as a $in)
  // undefined (no match since they mean field doesn't exist and can't be serialized)
  if (
    (!(isArray(a) && isArray(b)) && (isArray(a) || isArray(b))) ||
    a === undefined ||
    b === undefined
  ) {
    return false
  }

  // General objects (check for deep equality)
  // a and b should be objects at this point
  try {
    aKeys = Object.keys(a)
    bKeys = Object.keys(b)
  } catch (e) {
    return false
  }

  if (aKeys.length !== bKeys.length) {
    return false
  }
  for (i = 0; i < aKeys.length; i += 1) {
    if (bKeys.indexOf(aKeys[i]) === -1) {
      return false
    }
    if (!areThingsEqual(a[aKeys[i]], b[aKeys[i]])) {
      return false
    }
  }
  return true
}

/**
 * Check that two values are comparable
 */
export function areComparable(a, b) {
  if (
    typeof a !== 'string' &&
    typeof a !== 'number' &&
    !isDate(a) &&
    typeof b !== 'string' &&
    typeof b !== 'number' &&
    !isDate(b)
  ) {
    return false
  }

  return typeof a === typeof b
}

/**
 * Tell if a given document matches a query
 * @param {Object} obj Document to check
 * @param {Object} query
 */
export function match(obj, query) {
  let queryKey, queryValue, i

  // Primitive query against a primitive type
  // This is a bit of a hack since we construct an object with an arbitrary key only to dereference it later
  // But I don't have time for a cleaner implementation now
  if (isPrimitiveType(obj) || isPrimitiveType(query)) {
    return matchQueryPart({ needAKey: obj }, 'needAKey', query)
  }

  // Normal query
  const queryKeys = Object.keys(query)
  for (i = 0; i < queryKeys.length; i += 1) {
    queryKey = queryKeys[i]
    queryValue = query[queryKey]

    if (queryKey[0] === '$') {
      if (!LogicalOperators[queryKey]) {
        throw new Error('Unknown logical operator ' + queryKey)
      }
      if (!LogicalOperators[queryKey](obj, queryValue)) {
        return false
      }
    } else {
      if (!matchQueryPart(obj, queryKey, queryValue)) {
        return false
      }
    }
  }

  return true
}

/**
 * Match an object against a specific { key: value } part of a query
 * if the treatObjAsValue flag is set, don't try to match every part separately, but the array as a whole
 */
function matchQueryPart(obj, queryKey, queryValue, treatObjAsValue = false) {
  const objValue = getDotValue(obj, queryKey)
  let i, keys, firstChars, dollarFirstChars

  // Check if the value is an array if we don't force a treatment as value
  if (isArray(objValue) && !treatObjAsValue) {
    // If the queryValue is an array, try to perform an exact match
    if (isArray(queryValue)) {
      return matchQueryPart(obj, queryKey, queryValue, true)
    }

    // Check if we are using an array-specific comparison function
    if (
      queryValue !== null &&
      typeof queryValue === 'object' &&
      !isRegExp(queryValue)
    ) {
      keys = Object.keys(queryValue)
      for (i = 0; i < keys.length; i += 1) {
        if (arrayComparisonFunctions[keys[i]]) {
          return matchQueryPart(obj, queryKey, queryValue, true)
        }
      }
    }

    // If not, treat it as an array of { obj, query } where there needs to be at least one match
    for (i = 0; i < objValue.length; i += 1) {
      if (matchQueryPart({ k: objValue[i] }, 'k', queryValue)) {
        return true
      } // k here could be any string
    }
    return false
  }

  // queryValue is an actual object. Determine whether it contains comparison operators
  // or only normal fields. Mixed objects are not allowed
  if (
    queryValue !== null &&
    typeof queryValue === 'object' &&
    !isRegExp(queryValue) &&
    !isArray(queryValue)
  ) {
    keys = Object.keys(queryValue)
    firstChars = _.map(keys, function (item) {
      return item[0]
    })
    dollarFirstChars = _.filter(firstChars, function (c) {
      return c === '$'
    })

    if (
      dollarFirstChars.length !== 0 &&
      dollarFirstChars.length !== firstChars.length
    ) {
      throw new Error('You cannot mix operators and normal fields')
    }

    // queryValue is an object of this form: { $comparisonOperator1: value1, ... }
    if (dollarFirstChars.length > 0) {
      for (i = 0; i < keys.length; i += 1) {
        if (!ComparisonFunctions[keys[i]]) {
          throw new Error('Unknown comparison function ' + keys[i])
        }

        if (!ComparisonFunctions[keys[i]](objValue, queryValue[keys[i]])) {
          return false
        }
      }
      return true
    }
  }

  // Using regular expressions with basic querying
  if (isRegExp(queryValue)) {
    return ComparisonFunctions.$regex(objValue, queryValue)
  }

  // queryValue is either a native value or a normal object
  // Basic matching is possible
  return areThingsEqual(objValue, queryValue)
}

import { hasOwn, isInfOrNaN, keysOf, lengthOf } from '../utils'
import { EJSON } from './index'
import { customTypes } from './custom-types'
import { fromByteArray, toByteArray } from 'base64-js'

export const builtinConverters = [
  {
    // Date
    matchJSONValue(obj) {
      return hasOwn(obj, '$date') && lengthOf(obj) === 1
    },
    matchObject(obj) {
      return obj instanceof Date
    },
    toJSONValue(obj) {
      return { $date: obj.getTime() }
    },
    fromJSONValue(obj) {
      return new Date(obj.$date)
    },
  },
  {
    // RegExp
    matchJSONValue(obj) {
      return (
        hasOwn(obj, '$regexp') && hasOwn(obj, '$flags') && lengthOf(obj) === 2
      )
    },
    matchObject(obj) {
      return obj instanceof RegExp
    },
    toJSONValue(regexp) {
      return {
        $regexp: regexp.source,
        $flags: regexp.flags,
      }
    },
    fromJSONValue(obj) {
      // Replaces duplicate / invalid flags.
      return new RegExp(
        obj.$regexp,
        obj.$flags
          // Cut off flags at 50 chars to avoid abusing RegExp for DOS.
          .slice(0, 50)
          .replace(/[^gimuy]/g, '')
          .replace(/(.)(?=.*\1)/g, ''),
      )
    },
  },
  {
    // NaN, Inf, -Inf. (These are the only objects with typeof !== 'object'
    // which we match.)
    matchJSONValue(obj) {
      return hasOwn(obj, '$InfNaN') && lengthOf(obj) === 1
    },
    matchObject: isInfOrNaN,
    toJSONValue(obj) {
      let sign
      if (Number.isNaN(obj)) {
        sign = 0
      } else if (obj === Infinity) {
        sign = 1
      } else {
        sign = -1
      }
      return { $InfNaN: sign }
    },
    fromJSONValue(obj) {
      return obj.$InfNaN / 0
    },
  },
  {
    // Binary
    matchJSONValue(obj) {
      return hasOwn(obj, '$binary') && lengthOf(obj) === 1
    },
    matchObject(obj) {
      return (
        (typeof Uint8Array !== 'undefined' && obj instanceof Uint8Array) ||
        (obj && hasOwn(obj, '$Uint8ArrayPolyfill'))
      )
    },
    toJSONValue(obj) {
      return { $binary: fromByteArray(obj) }
    },
    fromJSONValue(obj) {
      return toByteArray(obj.$binary)
    },
  },
  {
    // Escaping one level
    matchJSONValue(obj) {
      return hasOwn(obj, '$escape') && lengthOf(obj) === 1
    },
    matchObject(obj) {
      let match = false
      if (obj) {
        const keyCount = lengthOf(obj)
        if (keyCount === 1 || keyCount === 2) {
          match = builtinConverters.some(converter =>
            converter.matchJSONValue(obj),
          )
        }
      }
      return match
    },
    toJSONValue(obj) {
      const newObj = {}
      keysOf(obj).forEach(key => {
        newObj[key] = EJSON.toJSONValue(obj[key])
      })
      return { $escape: newObj }
    },
    fromJSONValue(obj) {
      const newObj = {}
      keysOf(obj.$escape).forEach(key => {
        newObj[key] = EJSON.fromJSONValue(obj.$escape[key])
      })
      return newObj
    },
  },
  {
    // Custom
    matchJSONValue(obj) {
      return (
        hasOwn(obj, '$type') && hasOwn(obj, '$value') && lengthOf(obj) === 2
      )
    },
    matchObject(obj) {
      return EJSON._isCustomType(obj)
    },
    toJSONValue(obj) {
      const jsonValue = obj.toJSONValue()

      return { $type: obj.typeName(), $value: jsonValue }
    },
    fromJSONValue(obj) {
      const typeName = obj.$type

      if (!customTypes.has(typeName)) {
        throw new Error(`Custom EJSON type ${typeName} is not defined`)
      }

      const converter = customTypes.get(typeName)

      return converter(obj.$value)
    },
  },
]

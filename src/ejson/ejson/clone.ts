import {
  isArguments,
  isFunction,
  isObject,
  isObjectAndNotNull,
  keysOf,
} from '../utils'
import { EJSON } from './index'

export const clone = (rootVal: any) => {
  const set = new WeakSet()

  function internalClone(internalVal: any) {
    let ret: any

    if (!isObject(internalVal)) {
      return internalVal
    }

    if (internalVal === null) {
      return null // null has typeof "object"
    }

    if (internalVal instanceof Date) {
      return new Date(internalVal.getTime())
    }

    // RegExps are not really EJSON elements (eg we don't define a serialization
    // for them), but they're immutable anyway, so we can support them in clone.
    if (internalVal instanceof RegExp) {
      return internalVal
    }

    if (
      internalVal._bsontype === 'ObjectId' &&
      isFunction(internalVal.toString)
    ) {
      return internalVal.toString()
    }

    if (
      internalVal.constructor.name === 'model' &&
      isObject(internalVal._doc)
    ) {
      return internalClone(internalVal._doc)
    }

    if (EJSON.isBinary(internalVal)) {
      ret = EJSON.newBinary(internalVal.length)

      for (let i = 0; i < internalVal.length; i++) {
        ret[i] = internalVal[i]
      }

      return ret
    }

    function cloneArray(arr: any[]) {
      set.add(arr)

      return arr
        .map(val => {
          if (isObjectAndNotNull(val)) {
            if (set.has(val as object)) {
              return undefined
            }
            set.add(val as object)
          }

          return clone(val)
        })
        .filter(val => val !== undefined)
    }

    if (Array.isArray(internalVal)) {
      return cloneArray(internalVal)
    }

    if (isArguments(internalVal)) {
      set.add(internalVal)

      return cloneArray(Array.from(internalVal))
    }

    // handle general user-defined typed Objects if they have a clone method
    if (isFunction(internalVal.clone)) {
      return internalVal.clone()
    }

    // handle other custom types
    if (EJSON._isCustomType(internalVal)) {
      return EJSON.fromJSONValue(internalClone(EJSON.toJSONValue(internalVal)))
    }

    set.add(internalVal)

    ret = {}

    keysOf(internalVal).forEach(key => {
      if (isObjectAndNotNull(internalVal[key])) {
        if (set.has(internalVal[key])) return
        set.add(internalVal[key])
      }

      ret[key] = internalClone(internalVal[key])
    })

    return ret
  }

  return internalClone(rootVal)
}

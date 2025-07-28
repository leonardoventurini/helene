import { hasOwn, isFunction, isObject, keysOf } from '../utils'
import { EJSON } from './index'

export const equals = (a, b, options?: any) => {
  let i
  const keyOrderSensitive = !!(options && options.keyOrderSensitive)
  if (a === b) {
    return true
  }

  // This differs from the IEEE spec for NaN equality, b/c we don't want
  // anything ever with a NaN to be poisoned from becoming equal to anything.
  if (Number.isNaN(a) && Number.isNaN(b)) {
    return true
  }

  // if either one is falsy, they'd have to be === to be equal
  if (!a || !b) {
    return false
  }

  if (!(isObject(a) && isObject(b))) {
    return false
  }

  if (a instanceof Date && b instanceof Date) {
    return a.valueOf() === b.valueOf()
  }

  if (EJSON.isBinary(a) && EJSON.isBinary(b)) {
    if (a.length !== b.length) {
      return false
    }
    for (i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false
      }
    }
    return true
  }

  if (isFunction(a.equals)) {
    return a.equals(b, options)
  }

  if (isFunction(b.equals)) {
    return b.equals(a, options)
  }

  // Array.isArray works across iframes while instanceof won't
  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)

  // if not both or none are array they are not equal
  if (aIsArray !== bIsArray) {
    return false
  }

  if (aIsArray && bIsArray) {
    if (a.length !== b.length) {
      return false
    }
    for (i = 0; i < a.length; i++) {
      if (!EJSON.equals(a[i], b[i], options)) {
        return false
      }
    }
    return true
  }

  // fallback for custom types that don't implement their own equals
  // @ts-ignore
  switch (EJSON._isCustomType(a) + EJSON._isCustomType(b)) {
    case 1:
      return false
    case 2:
      return EJSON.equals(EJSON.toJSONValue(a), EJSON.toJSONValue(b))
    default: // Do nothing
  }

  // fall back to structural equality of objects
  let ret
  const aKeys = keysOf(a)
  const bKeys = keysOf(b)
  if (keyOrderSensitive) {
    i = 0
    ret = aKeys.every(key => {
      if (i >= bKeys.length) {
        return false
      }
      if (key !== bKeys[i]) {
        return false
      }
      if (!EJSON.equals(a[key], b[bKeys[i]], options)) {
        return false
      }
      i++
      return true
    })
  } else {
    i = 0
    ret = aKeys.every(key => {
      if (!hasOwn(b, key)) {
        return false
      }
      if (!EJSON.equals(a[key], b[key], options)) {
        return false
      }
      i++
      return true
    })
  }
  return ret && i === bKeys.length
}

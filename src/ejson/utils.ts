export const isFunction = fn => typeof fn === 'function'

export const isObject = fn => typeof fn === 'object'

export const keysOf = obj => Object.keys(obj)

export const lengthOf = obj => Object.keys(obj).length

export const hasOwn = (obj, prop) =>
  Object.prototype.hasOwnProperty.call(obj, prop)

export const convertMapToObject = map =>
  Array.from(map).reduce((acc, [key, value]) => {
    // reassign to not create new object
    acc[key] = value
    return acc
  }, {})

export const isArguments = obj => obj != null && hasOwn(obj, 'callee')

export const isInfOrNaN = obj =>
  Number.isNaN(obj) || obj === Infinity || obj === -Infinity

export const checkError = {
  maxStack: msgError =>
    new RegExp('Maximum call stack size exceeded', 'g').test(msgError),
}

export const handleError = fn =>
  function (...args) {
    try {
      return fn.apply(this, args)
    } catch (error) {
      const isMaxStack = checkError.maxStack(error.message)
      if (isMaxStack) {
        throw new Error('Converting circular structure to JSON')
      }
      throw error
    }
  }

export const quote = string => {
  return JSON.stringify(string)
}

export type PolyfillableArray = Array<number> & {
  $Uint8ArrayPolyfill?: boolean
}

export const newBinary = (len: number) => {
  if (typeof Uint8Array === 'undefined' || typeof ArrayBuffer === 'undefined') {
    const ret: PolyfillableArray = []

    for (let i = 0; i < len; i++) {
      ret.push(0)
    }

    ret.$Uint8ArrayPolyfill = true

    return ret
  }
  return new Uint8Array(new ArrayBuffer(len))
}

export const isObjectAndNotNull = obj => obj !== null && typeof obj === 'object'

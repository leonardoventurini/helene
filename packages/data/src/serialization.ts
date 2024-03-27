import { checkKey } from './model'

/**
 * Serialize an object to be persisted to a one-line string
 * For serialization/deserialization, we use the native JSON parser and not eval or Function
 * That gives us less freedom but data entered the database may come from users
 * so eval and the like are not safe
 * Accepted primitive types: Number, String, Boolean, Date, null
 * Accepted secondary types: Objects, Arrays
 */
export function serialize(obj: Record<string, any>) {
  return JSON.stringify(obj, function (k, v) {
    checkKey(k, v)

    if (v === undefined) {
      return undefined
    }
    if (v === null) {
      return null
    }

    // Hackish way of checking if object is Date (this way it works between execution contexts in node-webkit).
    // We can't use value directly because for dates it is already string in this function (date.toJSON was already called), so we use this
    if (typeof this[k].getTime === 'function') {
      return { $$date: this[k].getTime() }
    }

    return v
  })
}

/**
 * From a one-line representation of an object generate by the serialize function
 * Return the object itself
 */
export function deserialize(rawData: string) {
  return JSON.parse(rawData, function (k, v) {
    if (k === '$$date') {
      return new Date(v)
    }
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      v === null
    ) {
      return v
    }
    if (v && v.$$date) {
      return v.$$date
    }

    return v
  })
}

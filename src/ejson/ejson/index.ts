import { clone } from './clone'
import { equals } from './equals'
import { isBinary } from './is-binary'
import { parse } from './parse'
import { stringify } from './stringify'
import { fromJSONValue } from './from-json-value'
import { toJSONValue } from './to-json-value'
import { convertMapToObject, isFunction, newBinary } from '../utils'
import { builtinConverters } from './built-in-converters'
import { customTypes } from './custom-types'
import { adjustTypesFromJSONValue } from './adjust-types-from-json-value'
import { adjustTypesToJSONValue } from './helpers/adjust-types-to-json-value'

export const EJSON = {
  clone,
  equals,
  isBinary,
  parse,
  stringify,
  fromJSONValue,
  toJSONValue,
  newBinary,

  /**
   * @summary Add a custom datatype to EJSON.
   * @locus Anywhere
   * @param {String} name A tag for your custom type; must be unique among
   *                      custom data types defined in your project, and must
   *                      match the result of your type's `typeName` method.
   * @param {Function} factory A function that deserializes a JSON-compatible
   *                           value into an instance of your type. This should
   *                           match the serialization performed by your
   *                           type's `toJSONValue` method.
   */
  addType(name: string, factory) {
    if (customTypes.has(name)) {
      throw new Error(`Type ${name} already present`)
    }

    customTypes.set(name, factory)
  },

  _isCustomType(obj) {
    return (
      obj &&
      isFunction(obj.toJSONValue) &&
      isFunction(obj.typeName) &&
      customTypes.has(obj.typeName())
    )
  },

  _getTypes(isOriginal = false) {
    return isOriginal ? customTypes : convertMapToObject(customTypes)
  },

  _getConverters() {
    return builtinConverters
  },

  _adjustTypesToJSONValue: adjustTypesToJSONValue,
  _adjustTypesFromJSONValue: adjustTypesFromJSONValue,
}

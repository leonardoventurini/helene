import { EJSON } from './index'
import { isObject } from '../utils'
import { adjustTypesToJSONValue } from './helpers/adjust-types-to-json-value'
import { toJSONValueHelper } from './helpers/to-json-value-helper'

export const toJSONValue = item => {
  const changed = toJSONValueHelper(item)
  if (changed !== undefined) {
    return changed
  }

  let newItem = item

  if (isObject(item)) {
    newItem = EJSON.clone(item)
    adjustTypesToJSONValue(newItem)
  }

  return newItem
}

import { EJSON } from './index'
import { isObject } from '../utils'
import { adjustTypesFromJSONValue } from './adjust-types-from-json-value'
import { fromJSONValueHelper } from './helpers/from-json-value-helper'

export const fromJSONValue = item => {
  let changed = fromJSONValueHelper(item)

  if (changed === item && isObject(item)) {
    changed = EJSON.clone(item)
    adjustTypesFromJSONValue(changed)
  }

  return changed
}

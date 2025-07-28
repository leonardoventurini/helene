import { handleError } from '../utils'
import { EJSON } from './index'
import { canonicalStringify } from '../stringify'

export const stringify = handleError((item, options) => {
  let serialized
  const json = EJSON.toJSONValue(item)

  if (options && (options.canonical || options.indent)) {
    serialized = canonicalStringify(json, options)
  } else {
    serialized = JSON.stringify(json)
  }

  return serialized
})

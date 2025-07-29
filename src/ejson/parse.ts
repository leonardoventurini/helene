import { EJSON } from './index'

/**
 * @todo Support buffers.
 *
 * @param item
 */
export const parse = item => {
  if (typeof item !== 'string')
    throw new Error('EJSON.parse argument should be a string')

  return EJSON.fromJSONValue(JSON.parse(item))
}

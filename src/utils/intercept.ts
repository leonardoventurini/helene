import { AnyFunction } from '@/types'
import { isNil, isPlainObject } from 'lodash'

/**
 * Get the params and the result and combine in a single output.
 *
 * @param func
 */
export function intercept(func: AnyFunction) {
  return async function (params) {
    let result = func.call(this, params)

    if (func.constructor.name === 'AsyncFunction' || result instanceof Promise)
      result = await result

    if (!isNil(result) && !isPlainObject(result)) {
      return result
    }

    return Object.assign({}, params, result ?? {})
  }
}

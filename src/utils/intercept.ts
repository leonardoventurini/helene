import { AnyFunction } from './types'
import isNil from 'lodash/isNil'
import isPlainObject from 'lodash/isPlainObject'

/**
 * Get the params and the result and combine in a single output.
 *
 * @param func
 */
export function intercept(func: AnyFunction) {
  return async function (params: any) {
    let result = func.call(this, params)

    if (func.constructor.name === 'AsyncFunction' || result instanceof Promise)
      result = await result

    /**
     * If the result is not an object, return it as is. We need to support primitives.
     */
    if (!isNil(result) && !isPlainObject(result)) {
      return result
    }

    return Object.assign({}, params, result ?? {})
  }
}

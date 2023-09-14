import { useMemo } from 'react'
import isEmpty from 'lodash/isEmpty'
import isFunction from 'lodash/isFunction'
import isNil from 'lodash/isNil'

export function useCircuitBreaker({ parse, params, required, deps }) {
  return useMemo(() => {
    const result = isFunction(parse) ? parse(params) : void 0

    const hasAllRequiredParams =
      isEmpty(required) || required.every(key => !isNil(params?.[key]))

    if (result !== void 0 || !hasAllRequiredParams) {
      return {
        shouldCall: false,
        placeholderValue: result,
      }
    }

    return { shouldCall: true }
  }, [params, parse, required, ...deps])
}

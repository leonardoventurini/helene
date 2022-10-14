import React, { useMemo } from 'react'
import { isEmpty, isFunction, isNil } from 'lodash'
import { useClient } from './use-client'

export function useCircuitBreaker({ parse, params, required, authOnly, deps }) {
  const client = useClient()

  return useMemo(() => {
    if (authOnly && !client.authenticated) {
      return { shouldCall: false }
    }

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
  }, [params, authOnly, parse, required, ...deps])
}

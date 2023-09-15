import { useCallback } from 'react'
import { EJSON } from 'bson'
import memoizee from 'memoizee'

export const useCaller = ({ client, cache, maxAge }) => {
  return useCallback(
    cache
      ? memoizee(client?.call, {
          maxAge,
          promise: true,
          normalizer: p => EJSON.stringify(p),
        })
      : client?.call,
    [cache, client],
  )
}

import { useCallback } from 'react'
import { isFunction } from 'lodash'

export function useMethodRefresh({
  authenticated,
  caller,
  client,
  isMounted,
  memoParams,
  method,
  setError,
  setLoading,
  setResult,
  shouldCall,
  startLoading,
  timeout,
}) {
  return useCallback(
    (callback?) => {
      const start = Date.now()

      if (!client.ready) return
      if (!method) return
      if (!isMounted()) return
      if (!shouldCall) return

      if (authenticated && !client.authenticated) {
        setLoading(false)
        return
      }

      startLoading()

      let successful = false

      caller
        ?.call(client, method, memoParams, { timeout })
        .then(_result => {
          if (!isMounted()) return

          setResult(_result)
          setError(undefined)
          successful = true
        })
        .catch(e => {
          if (!isMounted()) return

          setError(e)
          setResult(undefined)
        })
        .finally(() => {
          console.log(
            `Method Call: "${method}" ${Date.now() - start}ms (${
              successful ? 'successful' : 'failed'
            })`,
          )

          if (!isMounted()) return

          startLoading.cancel()
          setLoading(false)
          isFunction(callback) && callback()
        })
    },
    [
      client,
      method,
      memoParams,
      timeout,
      setResult,
      setLoading,
      setError,
      isMounted,
    ],
  )
}

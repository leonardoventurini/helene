import { useCallback } from 'react'
import { isFunction } from 'lodash'

export const useMethodRefresh = ({
  authenticated,
  caller,
  client,
  memoParams,
  method,
  setError,
  setLoading,
  setResult,
  shouldCall,
  startLoading,
  methodOptions,
  deps,
}) => {
  return useCallback(
    (callback?) => {
      if (!client.ready) return
      if (!method) return
      if (!shouldCall) return
      if (!caller) return

      if (authenticated && !client.authenticated) {
        setLoading(false)
        return
      }

      startLoading()

      let successful = false

      caller
        .call(client, method, memoParams, methodOptions)
        .then(_result => {
          setResult(_result)
          setError(undefined)
          successful = true
        })
        .catch(e => {
          setError(e)
          setResult(undefined)
        })
        .finally(() => {
          startLoading.cancel()
          setLoading(false)
          isFunction(callback) && callback()
        })
    },
    [
      client,
      method,
      memoParams,
      setResult,
      setLoading,
      setError,
      client.authenticated,
      ...Object.values(methodOptions),
      ...deps,
    ],
  )
}

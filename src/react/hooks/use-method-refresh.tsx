import { useCallback } from 'react'
import { isFunction } from 'lodash'

export const useMethodRefresh = ({
  authenticated,
  caller,
  client,
  params,
  method,
  setError,
  setLoading,
  setResult,
  shouldCall,
  startLoading,
  methodOptions,
  defaultValue,
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
        setResult(defaultValue)
        return
      }

      startLoading()

      let successful = false

      caller
        .call(client, method, params, methodOptions)
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
      params,
      setResult,
      setLoading,
      setError,
      client.authenticated,
      defaultValue,
      ...Object.values(methodOptions),
      ...deps,
    ],
  )
}

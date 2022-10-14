import { useCallback, useEffect, useMemo, useState } from 'react'
import { useClient } from './use-client'
import memoizee from 'memoizee'
import { ClientEvents, HeleneEvents, NO_CHANNEL } from '../../constants'
import { isFunction, noop } from 'lodash'
import { useDebouncedCallback } from 'use-debounce'
import { useEvent } from './use-event'
import { EJSON } from 'ejson2'
import { useCircuitBreaker } from './use-circuit-breaker'

export type UseMethodParams = {
  method?: string
  params?: any
  event?: string
  channel?: string
  defaultValue?: any
  cache?: boolean
  maxAge?: number
  timeout?: number
  deps?: any[]
  authenticated?: boolean
  debounced?: number
  lazy?: boolean
  authOnly?: boolean

  /**
   * Conditionally run the method or return a placeholder value.
   */
  parse?(params: any): any

  /**
   * Params required to call the method.
   */
  required?: string[]
}

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
  timeout,
  deps,
}) => {
  return useCallback(
    (callback?) => {
      if (!client.ready) return
      if (!method) return
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
      timeout,
      setResult,
      setLoading,
      setError,
      client.authenticated,
      ...deps,
    ],
  )
}

export const useMethod = ({
  method = null,
  params = undefined,
  event = null,
  channel = NO_CHANNEL,
  defaultValue = null,
  cache = false,
  maxAge = 60000,
  timeout = undefined,
  deps = [],
  authenticated = false,
  debounced = null,
  parse = null,
  lazy = false,
  required = [],
  authOnly,
}: UseMethodParams) => {
  const client = useClient()

  const memoParams = useMemo(() => params, deps)

  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(!!method)

  const { shouldCall, placeholderValue } = useCircuitBreaker({
    parse,
    params: memoParams,
    required,
    deps,
    authOnly,
  })

  const optimistic = useCallback(
    cb => {
      if (!isFunction(cb)) throw new Error('Function Expected')

      const simulatedResult = cb(result)

      setResult(simulatedResult)
    },
    [result, setResult],
  )

  /**
   * Starts loading only after a few milliseconds as humans do not perceive
   * small timeframes, and the loading indicator can be annoying.
   */
  const startLoading = useDebouncedCallback(() => {
    setLoading(true)
  }, 100)

  const caller = useCaller({ cache, client, maxAge })

  const refresh = useMethodRefresh({
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
    timeout,
    deps,
  })

  const initializing = useCallback(() => setLoading(true), [])

  const debouncedRefresh = useDebouncedCallback(refresh, debounced ?? 100)

  const refreshCallback = useMemo(
    () => (debounced ? debouncedRefresh : refresh),
    [debounced, debouncedRefresh, refresh],
  )

  useEvent(
    {
      event: ClientEvents.INITIALIZING,
    },
    initializing,
  )

  useEvent(
    {
      event: ClientEvents.INITIALIZED,
    },
    refreshCallback,
    [refreshCallback],
  )

  useEffect(() => {
    if (!method) return
    if (!client) return

    if (!lazy) refreshCallback()
  }, [client, method, memoParams, debounced])

  useEvent({ event, channel, subscribe: true }, refreshCallback, [
    refreshCallback,
  ])

  useEvent(
    {
      event: HeleneEvents.METHOD_REFRESH,
      channel,
      subscribe: true,
    },
    (refreshMethod: string) => {
      if (refreshMethod === method) {
        refreshCallback()
      }
    },
    [refreshCallback],
  )

  useEffect(
    () => () => {
      debouncedRefresh.cancel()
    },
    [],
  )

  if (!shouldCall) {
    return {
      result: placeholderValue ?? defaultValue,
      error,
      loading: false,
      refresh: noop,
      optimistic: noop,
      client,
    }
  }

  return {
    result: result ?? defaultValue,
    error,
    loading,
    refresh: refreshCallback,
    optimistic,
    client,
  }
}

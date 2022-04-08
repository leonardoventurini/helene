import { useCallback, useEffect, useMemo, useState } from 'react'
import { useClient } from './use-client'
import memoizee from 'memoizee'
import { ClientEvents, NO_CHANNEL } from '../../constants'
import { isFunction, noop } from 'lodash'
import { useDebouncedCallback } from 'use-debounce'
import { useIsMounted } from './utils/use-is-mounted'
import { useMethodRefresh } from './use-method-refresh'
import { useEvent } from './use-event'

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

  /**
   * Conditionally run the method or return a placeholder value.
   */
  parse?(params: any): any
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
}: UseMethodParams) => {
  const client = useClient()

  const memoParams = useMemo(() => params, deps)

  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(!!method)

  const { shouldCall, placeholderValue } = useMemo(() => {
    const result = isFunction(parse) ? parse(params) : void 0

    if (result !== void 0) {
      return {
        shouldCall: false,
        placeholderValue: result,
      }
    }

    return { shouldCall: true }
  }, [deps])

  const optimistic = useCallback(
    cb => {
      if (!isFunction(cb)) throw new Error('expected a function')

      const simulatedResult = cb(result)

      setResult(simulatedResult)
    },
    [result, setResult],
  )

  const isMounted = useIsMounted()

  /**
   * Starts loading only after a few milliseconds as humans do not perceive
   * small timeframes, and the loading indicator can be annoying.
   */
  const startLoading = useDebouncedCallback(() => {
    setLoading(true)
  }, 100)

  const caller = useCallback(
    cache
      ? memoizee(client?.call, {
          maxAge,
          promise: true,
          normalizer: p => JSON.stringify(p),
        })
      : client?.call,
    [cache, client],
  )

  const refresh = useMethodRefresh({
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
  })

  const debouncedRefresh = useDebouncedCallback(refresh, debounced ?? 100)

  const initializing = useCallback(() => setLoading(true), [])

  const refreshCallback = useMemo(
    () => (debounced ? debouncedRefresh : refresh),
    [debounced, debouncedRefresh, refresh],
  )

  useEffect(() => {
    if (!client) return

    client.on(ClientEvents.INITIALIZING, initializing)
    client.on(ClientEvents.INITIALIZED, refreshCallback)

    return () => {
      client.off(ClientEvents.INITIALIZING, initializing)
      client.off(ClientEvents.INITIALIZED, refreshCallback)
    }
  }, [client, initializing, refreshCallback])

  useEffect(() => {
    if (!method) return
    if (!client) return
    if (!isMounted) return

    if (!lazy) refreshCallback()
  }, [client, method, memoParams, debounced, isMounted])

  useEvent(event, refreshCallback, [refreshCallback], { channel })

  useEffect(
    () => () => {
      debouncedRefresh.cancel()
    },
    [],
  )

  if (!shouldCall) {
    return {
      result: placeholderValue,
      error,
      loading: false,
      refresh: noop,
      optimistic: noop,
    }
  }

  return {
    result: result ?? defaultValue,
    error,
    loading,
    refresh: refreshCallback,
    optimistic,
  }
}

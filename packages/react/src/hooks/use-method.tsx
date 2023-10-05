import { useCallback, useEffect, useMemo, useState } from 'react'
import { useClient } from './use-client'
import isFunction from 'lodash/isFunction'
import noop from 'lodash/noop'
import { useDebouncedCallback } from 'use-debounce'
import { useLocalEvent, useRemoteEvent } from './use-event'
import { useCircuitBreaker } from './use-circuit-breaker'
import { useMethodRefresh } from './use-method-refresh'
import { useCaller } from './use-caller'
import { ClientEvents, HeleneEvents, NO_CHANNEL } from '@helenejs/utils'
import { CallOptions } from '@helenejs/client'

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
  http?: boolean

  /**
   * Conditionally run the method or return a placeholder value.
   */
  parse?(params: any): any

  /**
   * Params required calling the method.
   */
  required?: string[]
} & CallOptions

export const useMethod = ({
  method = null,
  params: _params = undefined,
  event = null,
  channel = NO_CHANNEL,
  defaultValue: _defaultValue = null,
  cache = false,
  maxAge = 60000,
  deps = [],
  authenticated = false,
  debounced = null,
  parse = null,
  lazy = false,
  required = [],
  ...methodOptions
}: UseMethodParams) => {
  if (!method) {
    throw new Error('Method name is required.')
  }

  const client = useClient()

  const defaultValue = useMemo(() => _defaultValue, deps)
  const params = useMemo(() => _params, deps)

  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(!lazy)

  const { shouldCall, placeholderValue } = useCircuitBreaker({
    parse,
    params,
    required,
    deps,
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
  })

  const debouncedRefresh = useDebouncedCallback(refresh, debounced ?? 100)

  const refreshCallback = useMemo(
    () => (debounced ? debouncedRefresh : refresh),
    [debounced, debouncedRefresh, refresh],
  )

  useLocalEvent(
    {
      event: ClientEvents.INITIALIZING,
    },
    () => {
      if (authenticated) {
        setLoading(true)
      }
    },
    [authenticated],
  )

  useLocalEvent(
    {
      event: ClientEvents.INITIALIZED,
    },
    () => {
      if (authenticated) {
        refreshCallback()
      }
    },
    [refreshCallback, authenticated],
  )

  useLocalEvent(
    {
      event: ClientEvents.LOGOUT,
    },
    () => {
      if (authenticated) {
        refreshCallback()
      }
    },
    [refreshCallback, authenticated],
  )

  useEffect(() => {
    if (!method) return
    if (!client) return

    if (!lazy) refreshCallback()
  }, [client, method, params, debounced])

  useLocalEvent({ event, channel }, refreshCallback, [refreshCallback])

  useRemoteEvent(
    {
      event: HeleneEvents.METHOD_REFRESH,
      channel,
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

import { useCallback, useEffect, useState } from 'react'
import { ClientEvents } from '../../utils'
import { cloneDeep } from 'lodash'
import { useClient } from './use-client'
import { useDebouncedCallback } from 'use-debounce'

export function useAuth() {
  const client = useClient()
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(client.authenticated)
  const [context, setContext] = useState({})

  const updateState = useDebouncedCallback(() => {
    setReady(client?.ready ?? false)
    setAuthenticated(client?.authenticated ?? false)
    setContext(cloneDeep(client?.context ?? {}))
  }, 100)

  const unready = useCallback(() => setReady(false), [])

  useEffect(() => {
    updateState()

    client.on(ClientEvents.INITIALIZING, unready)
    client.on(ClientEvents.LOGOUT, updateState)
    client.on(ClientEvents.INITIALIZED, updateState)
    client.on(ClientEvents.LOGOUT, updateState)
    client.on(ClientEvents.CONTEXT_CHANGED, updateState)

    return () => {
      client.off(ClientEvents.INITIALIZING, unready)
      client.off(ClientEvents.LOGOUT, updateState)
      client.off(ClientEvents.INITIALIZED, updateState)
      client.off(ClientEvents.LOGOUT, updateState)
      client.off(ClientEvents.CONTEXT_CHANGED, updateState)
    }
  }, [updateState, unready])

  return {
    authenticated,
    client,
    context,
    loading: !ready,
    ready,
    setContext,
  }
}

import { useCallback, useEffect, useState } from 'react'
import { ClientEvents } from '@/constants'
import { cloneDeep } from 'lodash'
import { useClient } from './use-client'

export function useAuth() {
  const client = useClient()
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [context, setContext] = useState({})

  const updateState = useCallback(() => {
    setReady(client?.ready ?? false)
    setAuthenticated(client?.authenticated ?? false)
    setContext(cloneDeep(client?.context ?? {}))
  }, [client])

  const updateContextCallback = useCallback(
    data => {
      client?.updateContext(data).catch(console.error)
    },
    [client],
  )

  const unready = useCallback(() => setReady(false), [])

  useEffect(() => {
    if (!client) return

    updateState()

    client.on(ClientEvents.INITIALIZING, unready)
    client.on(ClientEvents.AUTH_CHANGED, updateState)
    client.on(ClientEvents.CONTEXT_CHANGED, updateState)

    return () => {
      client.off(ClientEvents.INITIALIZING, unready)
      client.off(ClientEvents.AUTH_CHANGED, updateState)
      client.off(ClientEvents.CONTEXT_CHANGED, updateState)
    }
  }, [client])

  return {
    authenticated,
    client,
    context,
    loading: !ready,
    ready,
    setContext,
  }
}

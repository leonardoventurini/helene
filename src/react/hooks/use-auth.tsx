import { useEffect, useState } from 'react'
import { ClientEvents } from '../../utils'
import { useClient } from './use-client'

export function useAuth() {
  const client = useClient()
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(client.authenticated)
  const [context, setContext] = useState(client.context)

  useEffect(() => {
    const unready = () => setReady(false)

    const updateState = () => {
      setReady(client.ready)
      setAuthenticated(client.authenticated)
      setContext(client.context)
    }

    updateState()

    client.on(ClientEvents.INITIALIZING, unready)
    client.on(ClientEvents.LOGOUT, updateState)
    client.on(ClientEvents.INITIALIZED, updateState)
    client.on(ClientEvents.CONTEXT_CHANGED, updateState)

    return () => {
      client.off(ClientEvents.INITIALIZING, unready)
      client.off(ClientEvents.LOGOUT, updateState)
      client.off(ClientEvents.INITIALIZED, updateState)
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

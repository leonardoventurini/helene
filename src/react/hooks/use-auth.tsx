import { useCallback, useEffect, useState } from 'react'
import { ClientEvents } from '../../utils'
import { useClient } from './use-client'
import { useRawEventObservable } from './use-event-observable'
import { useCombinedThrottle } from './use-combined-throttle'

export function useAuth() {
  const client = useClient()
  const [ready, setReady] = useState(client.ready)
  const [authenticated, setAuthenticated] = useState(client.authenticated)
  const [context, setContext] = useState(client.context)

  const logout$ = useRawEventObservable(client, ClientEvents.LOGOUT)
  const initialized$ = useRawEventObservable(client, ClientEvents.INITIALIZED)
  const contextChanged$ = useRawEventObservable(
    client,
    ClientEvents.CONTEXT_CHANGED,
  )

  const updateState = useCallback(() => {
    setReady(client.ready)
    setAuthenticated(client.authenticated)
    setContext(client.context)
  }, [client])

  useCombinedThrottle({
    observables: [logout$, initialized$, contextChanged$],
    throttle: 100,
    callback: updateState,
  })

  useEffect(() => {
    const unready = () => setReady(false)

    updateState()

    client.on(ClientEvents.INITIALIZING, unready)

    return () => {
      client.off(ClientEvents.INITIALIZING, unready)
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

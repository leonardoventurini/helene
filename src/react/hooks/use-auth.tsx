import { useCallback, useState } from 'react'
import { ClientEvents } from '../../utils'
import { useClient } from './use-client'
import { useLocalEventObservable } from './use-raw-event-observable'
import { useCombinedThrottle } from './use-combined-throttle'
import { useObject } from './use-object'

export function useAuth() {
  const client = useClient()
  const [authenticated, setAuthenticated] = useState(() => client.authenticated)
  const [context, setContext] = useState(() => client.context)

  const logout$ = useLocalEventObservable(ClientEvents.LOGOUT)
  const initialized$ = useLocalEventObservable(ClientEvents.INITIALIZED)
  const contextChanged$ = useLocalEventObservable(ClientEvents.CONTEXT_CHANGED)

  const updateState = useCallback(() => {
    setAuthenticated(client.authenticated)
    setContext(client.context)
  }, [])

  useCombinedThrottle({
    observables: [logout$, initialized$, contextChanged$],
    throttle: 1,
    callback: updateState,
  })

  return useObject({
    client,
    authenticated,
    context,
  })
}

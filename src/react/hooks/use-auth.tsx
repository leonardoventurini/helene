import { useCallback, useState } from 'react'
import { ClientEvents } from '../../utils'
import { useClient } from './use-client'
import { useRawEventObservable } from './use-raw-event-observable'
import { useCombinedThrottle } from './use-combined-throttle'
import { useObject } from './use-object'

export function useAuth() {
  const client = useClient()
  const [authenticated, setAuthenticated] = useState(() => client.authenticated)
  const [context, setContext] = useState(() => client.context)

  const logout$ = useRawEventObservable(client, ClientEvents.LOGOUT)
  const initialized$ = useRawEventObservable(client, ClientEvents.INITIALIZED)
  const contextChanged$ = useRawEventObservable(
    client,
    ClientEvents.CONTEXT_CHANGED,
  )

  const updateState = useCallback(() => {
    setAuthenticated(client.authenticated)
    setContext(client.context)
  }, [client])

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

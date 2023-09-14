import { useCallback, useState } from 'react'
import { ClientEvents } from '../../utils'
import { useClient } from './use-client'
import { useObject } from './use-object'
import { useThrottledEvents } from './use-throttled-events'

export function useAuth() {
  const client = useClient()
  const [authenticated, setAuthenticated] = useState(() => client.authenticated)
  const [context, setContext] = useState(() => client.context)

  const updateState = useCallback(() => {
    setAuthenticated(client.authenticated)
    setContext(client.context)
  }, [])

  useThrottledEvents(
    client,
    [
      ClientEvents.INITIALIZED,
      ClientEvents.LOGOUT,
      ClientEvents.CONTEXT_CHANGED,
    ],
    updateState,
    [updateState],
    16,
  )

  return useObject({
    client,
    authenticated,
    context,
  })
}

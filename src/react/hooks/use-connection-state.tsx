import { useCallback, useEffect, useRef, useState } from 'react'
import { useClient } from './use-client'
import { ClientEvents } from '../../utils'
import { useRawEventObservable } from './use-event-observable'
import { useCombinedThrottle } from './use-combined-throttle'

export const useConnectionState = ({
  reconnectOnVisibilityChange = false,
} = {}) => {
  const client = useClient()

  const intervalRef = useRef(null)

  const [isOffline, setOffline] = useState(true)
  const [isOnline, setOnline] = useState(false)
  const [isConnecting, setConnecting] = useState(false)

  const visibility$ = useRawEventObservable(document, 'visibilitychange')

  const initialized$ = useRawEventObservable(client, ClientEvents.INITIALIZED)
  const open$ = useRawEventObservable(client, ClientEvents.OPEN)
  const close$ = useRawEventObservable(client, ClientEvents.CLOSE)
  const connecting$ = useRawEventObservable(client, ClientEvents.CONNECTING)

  const updateConnectionState = useCallback(() => {
    setOffline(client.isOffline)
    setOnline(client.isOnline)
    setConnecting(client.isConnecting)
  }, [client])

  useCombinedThrottle({
    observables: [initialized$, open$, close$, connecting$],
    throttle: 100,
    callback: updateConnectionState,
  })

  useEffect(() => {
    if (!client) return

    updateConnectionState()

    intervalRef.current = setInterval(updateConnectionState, 1000)

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        client.connect().catch(console.error)
      }
    }

    let subscription = null

    if (reconnectOnVisibilityChange)
      subscription = visibility$.subscribe(handleVisibilityChange)

    return () => {
      subscription?.unsubscribe?.()

      clearInterval(intervalRef.current)
    }
  }, [client])

  return {
    isOffline,
    isOnline,
    isConnecting,
  }
}

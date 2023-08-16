import { useCallback, useEffect, useRef, useState } from 'react'
import { useClient } from './use-client'
import { ClientEvents } from '../../utils'
import { useRawEventObservable } from './use-raw-event-observable'
import { useCombinedThrottle } from './use-combined-throttle'

export const useConnectionState = () => {
  const client = useClient()

  const intervalRef = useRef(null)

  const [isOffline, setOffline] = useState(true)
  const [isOnline, setOnline] = useState(false)
  const [isConnecting, setConnecting] = useState(false)

  const initialized$ = useRawEventObservable(client, ClientEvents.INITIALIZED)
  const open$ = useRawEventObservable(client, ClientEvents.OPEN)
  const close$ = useRawEventObservable(client, ClientEvents.WEBSOCKET_CLOSED)
  const connecting$ = useRawEventObservable(client, ClientEvents.CONNECTING)

  const updateConnectionState = useCallback(() => {
    setOffline(client.isOffline)
    setOnline(client.isOnline)
    setConnecting(client.isConnecting)
  }, [client])

  useCombinedThrottle({
    observables: [initialized$, open$, close$, connecting$],
    throttle: 16,
    callback: updateConnectionState,
  })

  useEffect(() => {
    if (!client) return

    updateConnectionState()

    intervalRef.current = setInterval(updateConnectionState, 1000)

    return () => {
      clearInterval(intervalRef.current)
    }
  }, [client])

  return {
    isOffline,
    isOnline,
    isConnecting,
  }
}

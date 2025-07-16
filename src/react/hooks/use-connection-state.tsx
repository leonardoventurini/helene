import { ClientEvents } from '@helenejs/utils'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useClient } from './use-client'
import { useThrottledEvents } from './use-throttled-events'

export function useConnectionState() {
  const client = useClient()

  const intervalRef = useRef(null)

  const [isOffline, setOffline] = useState(true)
  const [isOnline, setOnline] = useState(false)
  const [isConnecting, setConnecting] = useState(false)

  const updateConnectionState = useCallback(() => {
    setOffline(client.isOffline)
    setOnline(client.isOnline)
    setConnecting(client.isConnecting)
  }, [client])

  useThrottledEvents(
    client,
    [
      ClientEvents.INITIALIZED,
      ClientEvents.WEBSOCKET_CLOSED,
      ClientEvents.CONNECTING,
    ],
    updateConnectionState,
    [updateConnectionState],
    16,
  )

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

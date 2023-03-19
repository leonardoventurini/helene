import { useEffect, useRef, useState } from 'react'
import { useClient } from './use-client'
import { ClientEvents } from '../../utils'

export const useConnectionState = ({
  reconnectOnVisibilityChange = false,
} = {}) => {
  const client = useClient()

  const intervalRef = useRef(null)

  const [isOffline, setOffline] = useState(true)
  const [isOnline, setOnline] = useState(false)
  const [isConnecting, setConnecting] = useState(false)

  useEffect(() => {
    if (!client) return

    const updateConnectionState = () => {
      setOffline(client.isOffline)
      setOnline(client.isOnline)
      setConnecting(client.isConnecting)
    }

    updateConnectionState()

    intervalRef.current = setInterval(updateConnectionState, 1000)

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        client.connect().catch(console.error)
      }
    }

    if (reconnectOnVisibilityChange)
      document.addEventListener('visibilitychange', handleVisibilityChange)

    client.on(ClientEvents.INITIALIZED, updateConnectionState)
    client.on(ClientEvents.OPEN, updateConnectionState)
    client.on(ClientEvents.CLOSE, updateConnectionState)
    client.on(ClientEvents.CONNECTING, updateConnectionState)

    return () => {
      if (reconnectOnVisibilityChange)
        document.removeEventListener('visibilitychange', handleVisibilityChange)

      client.off(ClientEvents.INITIALIZED, updateConnectionState)
      client.off(ClientEvents.OPEN, updateConnectionState)
      client.off(ClientEvents.CLOSE, updateConnectionState)
      client.off(ClientEvents.CONNECTING, updateConnectionState)

      clearInterval(intervalRef.current)
    }
  }, [client])

  return {
    isOffline,
    isOnline,
    isConnecting,
  }
}

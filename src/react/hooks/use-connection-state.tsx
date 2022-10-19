import { useCallback, useEffect, useState } from 'react'
import { useClient } from './use-client'
import { ClientEvents } from '../../constants'

export const useConnectionState = () => {
  const client = useClient()

  const [isOffline, setOffline] = useState(true)
  const [isOnline, setOnline] = useState(false)
  const [isConnecting, setConnecting] = useState(false)

  const updateConnectionState = useCallback(() => {
    setOffline(client.isOffline)
    setOnline(client.isOnline)
    setConnecting(client.isConnecting)
  }, [client])

  useEffect(() => {
    if (!client) return

    setOffline(client.isOffline)
    setOnline(client.isOnline)

    client.on(ClientEvents.INITIALIZED, updateConnectionState)
    client.on(ClientEvents.OPEN, updateConnectionState)
    client.on(ClientEvents.CLOSE, updateConnectionState)
    client.on(ClientEvents.CONNECTING, updateConnectionState)

    return () => {
      client.off(ClientEvents.INITIALIZED, updateConnectionState)
      client.off(ClientEvents.OPEN, updateConnectionState)
      client.off(ClientEvents.CLOSE, updateConnectionState)
      client.off(ClientEvents.CONNECTING, updateConnectionState)
    }
  }, [client])

  return {
    isOffline,
    isOnline,
    isConnecting,
  }
}

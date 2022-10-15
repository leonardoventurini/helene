import { useCallback, useEffect, useState } from 'react'
import { useClient } from './use-client'
import { ClientEvents } from '../../constants'
import { singletonHook } from 'react-singleton-hook'

export const useConnectionState = singletonHook(
  {
    isOffline: true,
    isOnline: false,
  },
  () => {
    const client = useClient()

    const [isOffline, setOffline] = useState(true)
    const [isOnline, setOnline] = useState(false)

    const updateConnectionState = useCallback(() => {
      setOffline(client.isOffline)
      setOnline(client.isOnline)
    }, [client])

    useEffect(() => {
      if (!client) return

      setOffline(client.isOffline)
      setOnline(client.isOnline)

      client.on(ClientEvents.INITIALIZED, updateConnectionState)
      client.on(ClientEvents.OPEN, updateConnectionState)
      client.on(ClientEvents.CLOSE, updateConnectionState)

      return () => {
        client.off(ClientEvents.INITIALIZED, updateConnectionState)
        client.off(ClientEvents.OPEN, updateConnectionState)
        client.off(ClientEvents.CLOSE, updateConnectionState)
      }
    }, [client])

    return {
      isOffline,
      isOnline,
    }
  },
)

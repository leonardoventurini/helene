import React, { useCallback, useEffect, useState } from 'react'
import { ClientEvents } from '../../constants'
import { useClient } from './use-client'

export const useHeleneContext = () => {
  const client = useClient()

  const [context, setContext] = useState(client?.context ?? {})

  const setContextCallback = useCallback(
    () => setContext(client?.context),
    [client],
  )

  const updateContextCallback = useCallback(
    data => {
      client?.updateContext(data).catch(console.error)
    },
    [client],
  )

  useEffect(() => {
    if (!client) return

    client.on(ClientEvents.INITIALIZED, setContextCallback)
    client.on(ClientEvents.CONTEXT_CHANGED, setContextCallback)

    return () => {
      client.off(ClientEvents.INITIALIZED, setContextCallback)
      client.off(ClientEvents.CONTEXT_CHANGED, setContextCallback)
    }
  }, [client])

  return [context, updateContextCallback]
}

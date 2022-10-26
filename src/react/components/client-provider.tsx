import { useCreation } from 'ahooks'
import React, { PropsWithChildren, useEffect } from 'react'
import { Client, ClientOptions } from '../../client/client'

export const ClientContext = React.createContext(undefined)

ClientContext.displayName = 'HeleneClientContext'

export const ClientProvider = ({
  clientInstance = null,
  clientOptions,
  children,
}: PropsWithChildren<{
  clientOptions?: ClientOptions
  clientInstance?: Client
}>) => {
  const client = useCreation(() => {
    if (clientInstance) return clientInstance

    return new Client(clientOptions)
  }, [])

  useEffect(
    () => () => {
      client?.close().catch(console.error)
    },
    [],
  )

  return (
    <ClientContext.Provider value={client}>
      {client ? children : null}
    </ClientContext.Provider>
  )
}

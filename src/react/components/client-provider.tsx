import React, { PropsWithChildren, useEffect, useState } from 'react'
import { Client, ClientOptions } from '@/client/client'

export const ClientContext = React.createContext(null)

ClientContext.displayName = 'HeleneClientContext'

export const ClientProvider = ({
  clientInstance = null,
  clientOptions,
  children,
}: PropsWithChildren<{
  clientOptions?: ClientOptions
  clientInstance?: Client
}>) => {
  const [client, setClient] = useState(clientInstance)

  useEffect(() => {
    if (clientInstance) {
      return
    }

    const _client = new Client(clientOptions)

    setClient(_client)

    return () => {
      client?.close().catch(console.error)
    }
  }, [])

  return (
    <ClientContext.Provider value={client}>
      {client ? children : null}
    </ClientContext.Provider>
  )
}

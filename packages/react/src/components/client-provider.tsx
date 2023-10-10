import React, { PropsWithChildren } from 'react'
import { Client, ClientOptions } from '@helenejs/client'

export const ClientContext = React.createContext(undefined)

ClientContext.displayName = 'HeleneClientContext'

let client: Client

export const ClientProvider = ({
  clientInstance = null,
  clientOptions,
  children,
}: PropsWithChildren<{
  clientOptions?: ClientOptions
  clientInstance?: Client
}>) => {
  if (!client) {
    client = clientInstance ?? new Client(clientOptions)
  }

  return (
    <ClientContext.Provider value={client}>
      {client ? children : null}
    </ClientContext.Provider>
  )
}

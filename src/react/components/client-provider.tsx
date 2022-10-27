import React, { PropsWithChildren } from 'react'
import { Client, ClientOptions } from '../../client/client'

export const ClientContext = React.createContext(undefined)

ClientContext.displayName = 'HeleneClientContext'

let client = null

export const ClientProvider = ({
  clientInstance = null,
  clientOptions,
  children,
}: PropsWithChildren<{
  clientOptions?: ClientOptions
  clientInstance?: Client
}>) => {
  if (!clientInstance && !client) {
    client = new Client(clientOptions)
  }

  const instance = clientInstance ?? client

  return (
    <ClientContext.Provider value={instance}>
      {instance ? children : null}
    </ClientContext.Provider>
  )
}

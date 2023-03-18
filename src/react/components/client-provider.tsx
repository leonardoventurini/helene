import React, { PropsWithChildren } from 'react'
import { Client, ClientOptions } from '../../client'
import { useCreation } from 'ahooks'

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
  const client = useCreation(
    () => clientInstance ?? new Client(clientOptions),
    [clientOptions],
  )

  return (
    <ClientContext.Provider value={client}>
      {client ? children : null}
    </ClientContext.Provider>
  )
}

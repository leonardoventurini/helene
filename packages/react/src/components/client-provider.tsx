import React, { PropsWithChildren } from 'react'
import useCreation from 'ahooks/lib/useCreation'
import { Client, ClientOptions } from '@helenejs/client'

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
    console.log('Helene: Creating client instance in provider')
    return clientInstance ?? new Client(clientOptions)
  }, [])

  return (
    <ClientContext.Provider value={client}>
      {client ? children : null}
    </ClientContext.Provider>
  )
}

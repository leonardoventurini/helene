import { Client } from '@helenejs/client'
import { Environment, ServerMethods } from '@helenejs/utils'
import { useContext } from 'react'
import { ClientContext } from '../components'

export function useClient<
  T extends ServerMethods = ServerMethods,
>(): Client<T> {
  const client = useContext(ClientContext)

  if (Environment.isServer) return null

  if (!client) {
    throw new Error('Client Not Found')
  }

  return client
}

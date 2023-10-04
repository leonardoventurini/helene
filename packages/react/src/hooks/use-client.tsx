import { useContext } from 'react'
import { ClientContext } from '../components'
import { Client, Environment } from '@helenejs/core'

export const useClient = (): Client => {
  const client = useContext(ClientContext)

  if (Environment.isServer) return null

  if (!client) {
    throw new Error('Client Not Found')
  }

  return client
}

import { useContext } from 'react'
import { ClientContext } from '../components'
import { Client } from '@helenejs/client'
import { Environment } from '@helenejs/utils'

export const useClient = (): Client => {
  const client = useContext(ClientContext)

  if (Environment.isServer) return null

  if (!client) {
    throw new Error('Client Not Found')
  }

  return client
}

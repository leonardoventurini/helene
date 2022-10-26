import React, { useContext } from 'react'
import { ClientContext } from '../components'
import { Client } from '../../client/client'
import { Environment } from '../../utils/environment'

export const useClient = (): Client => {
  const client = useContext(ClientContext)

  if (Environment.isServer) return null

  if (!client) {
    throw new Error('Client Not Found')
  }

  return client
}

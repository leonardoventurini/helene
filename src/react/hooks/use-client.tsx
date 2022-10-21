import React, { useContext } from 'react'
import { ClientContext } from '../components'
import { Client } from '../../client/client'

export const useClient = (): Client => {
  const client = useContext(ClientContext)

  if (!client) {
    throw new Error('Client Not Found')
  }

  return client
}

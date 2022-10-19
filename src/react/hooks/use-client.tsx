import React, { useContext } from 'react'
import { ClientContext } from '../components'
import { Client } from '@/client/client'

export const useClient = (): Client | null => useContext(ClientContext)

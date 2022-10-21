import { useClient } from './use-client'
import { NO_CHANNEL } from '../../constants'

export function useChannel(channel: string = NO_CHANNEL) {
  const client = useClient()

  return client.channel(channel)
}

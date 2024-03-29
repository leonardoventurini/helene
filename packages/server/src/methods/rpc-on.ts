import { Method } from '../method'
import isEmpty from 'lodash/isEmpty'
import { NO_CHANNEL } from '@helenejs/utils'

export const rpcOn = (server, method) =>
  new Method(
    server,
    method,
    async function ({ events, channel = NO_CHANNEL }) {
      if (isEmpty(events)) return {}

      const channelAllowed = await server.shouldAllowChannelSubscribe(
        this,
        channel,
      )

      const acc = {}

      for (const eventName of events) {
        if (!channelAllowed) {
          acc[eventName] = false
          continue
        }

        const event = server.events.get(eventName)

        if (!event) {
          console.log('[Helene] Event Not Found:', eventName)
          acc[eventName] = false
          continue
        }

        const eventAllowed = !event.isProtected || this.authenticated

        if (!eventAllowed) {
          acc[eventName] = false
          continue
        }

        const subscribeAllowed = await event.shouldSubscribe(
          this,
          eventName,
          channel,
        )

        if (!subscribeAllowed) {
          acc[eventName] = false
          continue
        }

        const node = this.socket
          ? this
          : server.httpTransport.eventSourceClients.get(this.uuid)

        if (!node) {
          acc[eventName] = false
          continue
        }

        const serverChannel = server.channel(channel)
        serverChannel.addChannelClient(event.name, node)

        acc[eventName] = true
      }

      return acc
    },
    { protected: false },
  )

import { NO_CHANNEL } from '../../utils'
import { Method } from '../method'

export const rpcOff = (server, method) =>
  new Method(
    server,
    method,
    function ({ events, channel = NO_CHANNEL }) {
      const node = this.socket
        ? this
        : server.httpTransport.eventSourceClients.get(this.uuid)

      return events.reduce((acc, eventName) => {
        const ch = server.channel(channel)
        const event = ch.server.events.get(eventName)

        if (!event) {
          console.log('[Helene] Event Not Found:', eventName)

          return {
            ...acc,
            [eventName]: false,
          }
        }

        const isSubscribed = ch.isSubscribed(node, event)

        if (!isSubscribed) {
          console.log('[Helene] Event Not Subscribed:', eventName)
        }

        ch.clients.get(event.name)?.delete(node)

        return {
          ...acc,
          [eventName]: true,
        }
      }, {})
    },
    { protected: false },
  )

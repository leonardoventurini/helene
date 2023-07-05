import { Errors, NO_CHANNEL } from '../../utils'
import { Method } from '../method'

export const rpcOff = (server, method) =>
  new Method(
    server,
    method,
    function ({ events, channel = NO_CHANNEL }) {
      return events.reduce((acc, eventName) => {
        const ch = server.channel(channel)
        const event = ch.server.events.get(eventName)

        if (!event) {
          return {
            ...acc,
            [eventName]: Errors.EVENT_NOT_FOUND,
          }
        }

        const isSubscribed = ch.isSubscribed(this, event)

        if (!isSubscribed) {
          return {
            ...acc,
            [eventName]: Errors.EVENT_NOT_SUBSCRIBED,
          }
        }

        ch.clients.get(event.name).delete(this)

        return {
          ...acc,
          [eventName]: true,
        }
      }, {})
    },
    { protected: false },
  )

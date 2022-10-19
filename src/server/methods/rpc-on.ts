import { Method } from '../method'
import { isEmpty } from 'lodash'
import { NO_CHANNEL } from '../../constants'

export const rpcOn = server =>
  new Method(
    function ({ events, channel = NO_CHANNEL }) {
      if (isEmpty(events)) return {}

      const channelDisallowed =
        server.shouldAllowChannelSubscribe &&
        !server.shouldAllowChannelSubscribe(this, channel)

      return events.reduce((acc, eventName) => {
        if (channelDisallowed) {
          return {
            ...acc,
            [eventName]: false,
          }
        }

        const event = server.events.get(eventName)

        if (!event) {
          return {
            ...acc,
            [eventName]: false,
          }
        }

        if (
          (event.isProtected && !this.authenticated) ||
          !event.shouldSubscribe(this, eventName, channel)
        ) {
          return {
            ...acc,
            [eventName]: false,
          }
        }

        const serverChannel = server.channel(channel)
        serverChannel.addChannelClient(event.name, this)

        return {
          ...acc,
          [eventName]: true,
        }
      }, {})
    },
    { protected: false },
  )

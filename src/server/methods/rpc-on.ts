import { Method } from '../method'
import { NO_CHANNEL } from '../../constants'
import { isEmpty } from 'lodash'

export const rpcOn = (server, namespace) =>
  new Method(
    function ({ events, channel = NO_CHANNEL }) {
      if (isEmpty(events)) return {}

      return events.reduce((acc, eventName) => {
        const event = namespace.channel(channel).events.get(eventName)

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

        event.clients.set(this._id, this)

        return {
          ...acc,
          [eventName]: true,
        }
      }, {})
    },
    { protected: false },
  )

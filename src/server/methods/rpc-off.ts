import { Method } from '../method'
import { NO_CHANNEL } from '../../constants'
import { Errors } from '../../errors'

export const rpcOff = server =>
  new Method(
    function ({ events, channel = NO_CHANNEL }) {
      return events.reduce((acc, eventName) => {
        const event = server.channel(channel).events.get(eventName)

        if (!event) {
          return {
            ...acc,
            [eventName]: Errors.EVENT_NOT_FOUND,
          }
        }

        const isSubscribed = event.isSubscribed(this)

        if (!isSubscribed) {
          return {
            ...acc,
            [eventName]: Errors.EVENT_NOT_SUBSCRIBED,
          }
        }

        event.clients.delete(this._id)

        return {
          ...acc,
          [eventName]: true,
        }
      }, {})
    },
    { protected: false },
  )

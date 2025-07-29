import { Method } from './method'
import pick from 'lodash/pick'
import isEmpty from 'lodash/isEmpty'
import { ServerEvents, NO_CHANNEL } from '../utils'
import { Server } from './server'

export const rpcInit = (server: Server, method: string) =>
  new Method(
    server,
    method,
    async function ({ meta, ...context }) {
      this.meta = meta
      this.context = context

      if (server.auth instanceof Function) {
        const caller = server.auth.call(this, context)

        const result = caller instanceof Promise ? await caller : caller

        this.authenticated = Boolean(result)
        this.setContext(result)

        if (!this.authenticated) return false

        server.emit(ServerEvents.AUTHENTICATION, this)

        return pick(result, server.allowedContextKeys)
      }

      return false
    },
    { protected: false },
  )

export const rpcOff = (server, method) =>
  new Method(
    server,
    method,
    function ({ events, channel = NO_CHANNEL }) {
      const node = this.socket ? this : null

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

        const node = this.socket ? this : null

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

export const rpcLogout = (server, method) =>
  new Method(
    server,
    method,
    async function () {
      this.context = null
      this.authenticated = false
      this.userId = null
      server.emit(ServerEvents.LOGOUT, this)
      return true
    },
    { protected: true },
  )

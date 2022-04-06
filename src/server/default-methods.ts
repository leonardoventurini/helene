import { Method } from './method'
import { Namespace } from './namespace'
import { Server } from './server'
import { Errors } from '../errors'
import { NO_CHANNEL } from '../constants'
import { isEmpty, pick } from 'lodash'

export enum Methods {
  RPC_LOGIN = 'rpc:login',
  RPC_LOGOUT = 'rpc:logout',
  RPC_INIT = 'rpc:init',
  RPC_ON = 'rpc:on',
  RPC_OFF = 'rpc:off',
  LIST_METHODS = 'list:methods',
  KEEP_ALIVE = 'keep:alive',
}

export const DefaultMethods: {
  [key: string]: (server: Server, namespace: Namespace) => Method
} = {
  [Methods.KEEP_ALIVE]: () =>
    new Method(
      function () {
        return 'pong'
      },
      { protected: false },
    ),
  [Methods.LIST_METHODS]: (server, namespace) =>
    new Method(
      function () {
        return Object.keys(namespace.methods.keys())
      },
      { protected: false },
    ),
  [Methods.RPC_ON]: (server, namespace) =>
    new Method(
      function ({ events, channel = NO_CHANNEL }) {
        if (isEmpty(events)) return {}

        return events.reduce((acc, eventName) => {
          const event = namespace.channel(channel).events.get(eventName)

          if (!event) {
            return {
              ...acc,
              [eventName]: Errors.EVENT_NOT_FOUND,
            }
          }

          if (event.isProtected && !this.authenticated) {
            if (!event) {
              return {
                ...acc,
                [eventName]: Errors.EVENT_FORBIDDEN,
              }
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
    ),

  [Methods.RPC_OFF]: (server, namespace) =>
    new Method(
      function ({ events, channel = NO_CHANNEL }) {
        return events.reduce((acc, eventName) => {
          const event = namespace.channel(channel).events.get(eventName)

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
    ),
  [Methods.RPC_INIT]: server =>
    new Method(
      async function (context) {
        this.context = context

        if (server.auth instanceof Function) {
          const caller = server.auth.call(this, context)
          const result = caller instanceof Promise ? await caller : caller

          this.authenticated = Boolean(result)

          if (!this.authenticated) return false

          this.context = this.authenticated
            ? Object.assign({}, result, this.context)
            : {}

          return pick(result, server.allowedContextKeys)
        }

        return this.authenticated
      },
      { protected: false },
    ),
  [Methods.RPC_LOGOUT]: () =>
    new Method(
      async function () {
        this.context = null
        this.authenticated = false
        return true
      },
      { protected: true },
    ),
}

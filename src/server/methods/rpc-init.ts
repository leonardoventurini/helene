import { Method } from '../method'
import { pick } from 'lodash'
import { ServerEvents } from '../../utils/constants'

export const rpcInit = server =>
  new Method(
    async function ({ meta, ...context }) {
      this.meta = meta
      this.context = context

      if (server.auth instanceof Function) {
        const caller = server.auth.call(this, context)
        const result = caller instanceof Promise ? await caller : caller

        this.authenticated = Boolean(result)

        if (!this.authenticated) return false

        this.context = this.authenticated
          ? Object.assign({}, result, this.context)
          : {}

        if (!result?.user || !result?.user?._id) {
          throw new Error(
            'The auth function must return a user object with a valid "_id" property',
          )
        }

        this.userId = this.context.user._id

        server.emit(ServerEvents.AUTHENTICATION, this)

        return pick(result, server.allowedContextKeys)
      }

      return this.authenticated
    },
    { protected: false },
  )

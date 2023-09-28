import { Method } from '../method'
import pick from 'lodash/pick'
import { ServerEvents } from '../../utils'
import { Server } from '../server'

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

import { Method } from '../method'
import { pick } from 'lodash'

export const rpcInit = server =>
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
  )

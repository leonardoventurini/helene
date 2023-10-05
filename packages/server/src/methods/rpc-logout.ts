import { Method } from '../method'
import { ServerEvents } from '@helenejs/utils'

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

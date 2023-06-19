import { Method } from '../method'
import { ServerEvents } from '../../utils'

export const rpcLogout = server =>
  new Method(
    async function () {
      this.context = null
      this.authenticated = false
      this.userId = null
      server.emit(ServerEvents.LOGOUT, this)
      return true
    },
    { protected: true },
  )

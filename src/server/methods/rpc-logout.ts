import { Method } from '../method'
import { ServerEvents } from '../../constants'

export const rpcLogout = server =>
  new Method(
    async function () {
      this.context = null
      this.authenticated = false
      server.emit(ServerEvents.LOGOUT, this)
      return true
    },
    { protected: true },
  )

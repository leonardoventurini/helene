import { Method } from '../method'

export const rpcLogout = () =>
  new Method(
    async function () {
      this.context = null
      this.authenticated = false
      return true
    },
    { protected: true },
  )

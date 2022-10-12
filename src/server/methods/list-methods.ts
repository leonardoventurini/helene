import { Method } from '../method'

export const listMethods = server =>
  new Method(
    function () {
      return Object.keys(server.methods.keys())
    },
    { protected: false },
  )

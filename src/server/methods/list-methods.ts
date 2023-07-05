import { Method } from '../method'

export const listMethods = (server, method) =>
  new Method(
    server,
    method,
    function () {
      return Object.keys(server.methods.keys())
    },
    { protected: false },
  )

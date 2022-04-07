import { Method } from '../method'

export const listMethods = (server, namespace) =>
  new Method(
    function () {
      return Object.keys(namespace.methods.keys())
    },
    { protected: false },
  )

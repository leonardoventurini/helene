import { Method } from '../method'

export const keepAlive = () =>
  new Method(
    function () {
      return 'pong'
    },
    { protected: false },
  )

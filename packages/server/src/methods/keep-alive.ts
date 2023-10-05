import { Method } from '../method'
import { HeleneEvents } from '@helenejs/utils'

export const keepAlive = (server, method) =>
  new Method(
    server,
    method,
    function () {
      clearTimeout(this.terminationTimeout)

      // This can be used mostly for testing.
      this.emit(HeleneEvents.KEEP_ALIVE)

      return true
    },
    { protected: false },
  )

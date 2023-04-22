import { Method } from '../method'
import { HeleneEvents } from '../../utils'

export const keepAlive = () =>
  new Method(
    function () {
      clearTimeout(this.terminationTimeout)

      // This can be used mostly for testing.
      this.emit(HeleneEvents.KEEP_ALIVE)

      return true
    },
    { protected: false },
  )

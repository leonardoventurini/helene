import { Method } from '../method'
import { HeleneEvents } from '../../utils'
import { Server } from '../server'

export const eventProbe = (server: Server, method: string) =>
  new Method(
    server,
    method,
    function () {
      this.sendEvent(HeleneEvents.EVENT_PROBE)

      return true
    },
    { protected: false },
  )

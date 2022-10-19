import { Method } from '../method'

export const onlineStats = () =>
  new Method(
    async function () {
      if (this.server.redisTransport) {
        return await this.server.redisTransport.getStats()
      }

      return {
        clients: this.server.clients.size,
      }
    },
    { protected: true },
  )

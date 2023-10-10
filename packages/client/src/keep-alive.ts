import { ClientEvents, HeleneEvents, Methods } from '@helenejs/utils'
import { Client } from './client'

export class KeepAlive {
  keepAliveTimeout: NodeJS.Timeout = null

  /**
   * The server sends the keep alive and not the client.
   */
  constructor(public client: Client) {
    this.start()
  }

  start() {
    // If the server stops sending the keep alive event we should disconnect.
    this.client.on(HeleneEvents.KEEP_ALIVE, () => {
      clearTimeout(this.keepAliveTimeout)

      this.keepAliveTimeout = setTimeout(
        async () => {
          await this.client.close()
          this.client.emit(HeleneEvents.KEEP_ALIVE_DISCONNECT)
        },
        // 2x the keep alive interval as a safety net.
        Client.KEEP_ALIVE_INTERVAL * 2,
      )

      return this.client.call(Methods.KEEP_ALIVE)
    })

    this.client.on(
      [
        ClientEvents.CLOSE,
        ClientEvents.WEBSOCKET_CLOSED,
        ClientEvents.EVENTSOURCE_CLOSE,
      ],
      () => {
        this.stop()
      },
    )
  }

  stop() {
    if (this.keepAliveTimeout) {
      clearTimeout(this.keepAliveTimeout)
    }

    this.client.removeAllListeners(HeleneEvents.KEEP_ALIVE)
  }
}

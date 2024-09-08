import { ClientEvents, HeleneEvents, Methods } from '@helenejs/utils'
import { Client } from './client'

export class KeepAlive {
  keepAliveTimeout: NodeJS.Timeout = null

  /**
   * The server sends the keep alive and not the client.
   */
  constructor(public client: Client) {
    this.start()

    this.client.on(ClientEvents.WEBSOCKET_CONNECTED, this.start.bind(this))
    this.client.on(ClientEvents.EVENTSOURCE_OPEN, this.start.bind(this))

    this.client.on(ClientEvents.WEBSOCKET_CLOSED, this.stop.bind(this))
    this.client.on(ClientEvents.EVENTSOURCE_CLOSE, this.stop.bind(this))
  }

  start() {
    this.client.removeAllListeners(HeleneEvents.KEEP_ALIVE)

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

      return this.client.call(Methods.KEEP_ALIVE, null, {
        ignoreInit: true,
        httpFallback: false,
      })
    })
  }

  stop() {
    if (this.keepAliveTimeout) {
      clearTimeout(this.keepAliveTimeout)
    }

    this.client.removeAllListeners(HeleneEvents.KEEP_ALIVE)
  }
}

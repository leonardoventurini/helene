import throttle from 'lodash/throttle'
import defer from 'lodash/defer'
import { Client } from './client'
import { ClientEvents, Environment, WebSocketState } from '@helenejs/utils'
import isNumber from 'lodash/isNumber'
import Timeout = NodeJS.Timeout

export class IdleTimeout {
  timeout: number = null
  idleTimeout: Timeout = null

  constructor(public client: Client) {
    this.timeout = this.client.options.idlenessTimeout
    this.setup()
  }

  start() {
    if (
      isNumber(this.timeout) &&
      (Environment.isBrowser || Environment.isTest)
    ) {
      this.idleTimeout = setTimeout(() => {
        this.client
          .close()
          .then(() => {
            console.log('Helene: Disconnected due to inactivity')
          })
          .catch(console.error)
      }, this.timeout)
    }
  }

  setup() {
    this.client.on(ClientEvents.CLOSE, () => {
      clearTimeout(this.idleTimeout)
    })

    defer(() => {
      this.start()
    })

    if (typeof window === 'undefined') return

    const reset = isNumber(this.timeout)
      ? throttle(this.reset.bind(this), this.timeout / 2, {
          leading: true,
          trailing: true,
        })
      : null

    if (reset) {
      // https://github.com/socketio/socket.io/issues/2924#issuecomment-297985409
      window.addEventListener('focus', reset)
      window.addEventListener('mousemove', reset)
      window.addEventListener('mousedown', reset)
      window.addEventListener('keydown', reset)
      window.addEventListener('scroll', reset)
      window.addEventListener('touchstart', reset)
      window.addEventListener('pageshow', reset)
      window.addEventListener('pagehide', reset)
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.reset()
      } else {
        if (this.client.options?.ws?.disconnectOnPageHide) {
          this.client.close().then(() => {
            console.log(
              'Helene: Disconnected on page hide',
              this.client.clientSocket?.ready,
            )
          })
        }
      }
    })
  }

  stop() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout)
    }
  }

  async reset() {
    this.stop()
    this.start()

    if (this.client.mode.eventsource) {
      if (
        this.client.clientHttp.clientEventSource &&
        this.client.clientHttp.clientEventSource.readyState !==
          WebSocketState.CLOSED
      ) {
        return
      }

      await this.client.clientHttp.createEventSource()

      await this.client.waitFor(ClientEvents.EVENTSOURCE_OPEN, 10000)
      return
    }

    if (
      this.client.clientSocket.socket &&
      this.client.clientSocket.socket.readyState !== WebSocketState.CLOSED
    ) {
      return
    }

    this.client.clientSocket.connect()

    await this.client.waitFor(ClientEvents.WEBSOCKET_CONNECTED, 10000)
  }
}

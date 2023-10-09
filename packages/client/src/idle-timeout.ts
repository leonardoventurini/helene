import throttle from 'lodash/throttle'
import defer from 'lodash/defer'
import { Client } from './client'
import { ClientEvents } from '@helenejs/utils'
import Timeout = NodeJS.Timeout

export class IdleTimeout {
  idleTimeout: Timeout = null

  constructor(
    public timeout: number,
    public client: Client,
  ) {
    this.client.on(ClientEvents.INITIALIZED, () => {
      console.log('Helene: Idleness timeout started')
      this.setup()
    })
  }

  start() {
    this.idleTimeout = setTimeout(() => {
      this.client
        .close()
        .then(() => {
          console.log('Helene: Disconnected due to inactivity')
        })
        .catch(console.error)
    }, this.timeout)
  }

  setup() {
    this.client.on(ClientEvents.CLOSE, () => {
      clearTimeout(this.idleTimeout)
    })

    const reset = throttle(this.reset.bind(this), this.timeout / 2, {
      leading: true,
      trailing: true,
    })

    defer(() => {
      this.start()
    })

    if (typeof window === 'undefined') return

    // https://github.com/socketio/socket.io/issues/2924#issuecomment-297985409
    window.addEventListener('focus', reset)
    window.addEventListener('mousemove', reset)
    window.addEventListener('mousedown', reset)
    window.addEventListener('keydown', reset)
    window.addEventListener('scroll', reset)
    window.addEventListener('touchstart', reset)
    window.addEventListener('pageshow', reset)
    window.addEventListener('pagehide', reset)

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.reset()
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

    // If we don't wait for the client to initialize, it will cause a race condition when using WebSocket
    if (!this.client.initialized) {
      return
    }

    await this.client.connect()
  }
}

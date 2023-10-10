import { Client, WebSocketOptions } from './client'
import {
  ClientEvents,
  HELENE_WS_PATH,
  Presentation,
  WebSocketEvents,
  WebSocketState,
} from '@helenejs/utils'
import { EventEmitter2 } from 'eventemitter2'
import SockJS from 'sockjs-client/dist/sockjs'

export type Socket = typeof SockJS.constructor.prototype

export class ClientSocket extends EventEmitter2 {
  client: Client

  socket: Socket

  protocol: string
  uri: string

  connecting = false

  options: WebSocketOptions = {
    path: HELENE_WS_PATH,
  }

  closed = true

  get ready() {
    return Boolean(this.socket?.readyState === WebSocketState.OPEN)
  }

  constructor(client: Client, options: WebSocketOptions = {}) {
    super()

    this.client = client

    Object.assign(this.options, options ?? {})

    this.protocol = this.client.options.secure ? `https://` : `http://`

    if (this.client.options.port) {
      this.uri = `${this.protocol}${this.client.options.host}:${this.client.options.port}${this.options.path}`
    } else {
      this.uri = `${this.protocol}${this.client.options.host}${this.options.path}`
    }
  }

  async connect() {
    const self = this

    this.closed = false

    const timeFn = (i: number) =>
      Math.min(100 * Math.pow(i, 2), 60000) * (0.9 + 0.2 * Math.random())

    this.connecting = true
    this.client.emit(ClientEvents.CONNECTING)

    let recInterval = null
    let attempt = 0

    const conn = () => {
      self.socket = new SockJS(`${this.uri}?uuid=${this.client.uuid}`)

      clearInterval(recInterval)

      self.socket.onopen = () => {
        self.client.emit(ClientEvents.WEBSOCKET_CONNECTED)

        self.socket.addEventListener(
          WebSocketEvents.MESSAGE,
          this.handleMessage.bind(self),
        )

        self.connecting = false
        self.client.init().catch(console.error)
      }

      this.socket.onclose = () => {
        self.connecting = false
        self.socket = null
        self.client.emit(ClientEvents.WEBSOCKET_CLOSED)

        if (self.closed) return

        recInterval = setInterval(conn, timeFn(attempt++))
      }

      this.socket.onerror = err => {
        self.connecting = false
        console.error(err)
        self.client.emit(ClientEvents.ERROR, err)
      }
    }

    conn()

    await this.client.waitFor(ClientEvents.WEBSOCKET_CONNECTED)
  }

  public handleMessage(
    data: string | ArrayBuffer | Buffer | Buffer[] | MessageEvent,
  ) {
    const payload = Presentation.decode(data)

    this.client.emit(ClientEvents.INBOUND_MESSAGE, data)

    if (!payload) return

    this.client.payloadRouter(payload)
  }

  public close() {
    return new Promise<void>(resolve => {
      this.closed = true

      if (!this.socket) return resolve()

      this.client.once(ClientEvents.WEBSOCKET_CLOSED, resolve)

      this.socket?.close()

      this.connecting = false

      this.socket = undefined
    })
  }

  public send(payload: string) {
    if (!this.ready) return console.warn('Not Ready')

    this.client.emit(ClientEvents.OUTBOUND_MESSAGE, payload)

    this.socket.send(payload)
  }
}

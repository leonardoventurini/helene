import { Client, WebSocketOptions } from './client'
import {
  ClientEvents,
  HELENE_WS_PATH,
  PayloadType,
  Presentation,
  WebSocketEvents,
  WebSocketState,
} from '@helenejs/utils'
import { EventEmitter2 } from 'eventemitter2'
import SockJS from '@helenejs/isosockjs'

export class ClientSocket extends EventEmitter2 {
  client: Client
  socket: WebSocket

  protocol: string
  uri: string
  stopped = false

  connecting = false

  options: WebSocketOptions = {
    path: HELENE_WS_PATH,
  }

  baseAttemptDelay = 1000
  attempts = 0

  get ready() {
    return Boolean(this.socket?.readyState === WebSocketState.OPEN)
  }

  constructor(client: Client, options: WebSocketOptions = {}) {
    super()

    this.client = client

    Object.assign(this.options, options ?? {})

    this.protocol = this.client.options.secure ? 'https://' : 'http://'

    if (this.client.options.port) {
      this.uri = `${this.protocol}${this.client.options.host}:${this.client.options.port}${this.options.path}`
    } else {
      this.uri = `${this.protocol}${this.client.options.host}${this.options.path}`
    }
  }

  connect() {
    if (this.ready) {
      console.warn('Helene: Already Connected')
      return
    }

    this.stopped = false
    this.connecting = true
    this.client.emit(ClientEvents.CONNECTING)

    this.socket = new SockJS(this.uri)

    this.socket.onopen = () => {
      this.attempts = 0
      this.handleOpen()
    }

    this.socket.onclose = () => {
      console.log('Helene: Connection Closed')
      this.client.initialized = false
      this.client.initializing = false
      if (this.stopped) return
      this.socket = undefined
      setTimeout(
        () => {
          this.attempts++
          this.client.emit(ClientEvents.WEBSOCKET_RECONNECTING)
          this.connect()
        },
        Math.random() * this.baseAttemptDelay + 500,
      )
    }

    this.socket.onerror = error => {
      console.error(error)
    }
  }

  async close() {
    this.stopped = true
    this.connecting = false

    if (!this.socket) return

    this.socket.close()
    this.socket = undefined

    await this.client.waitFor(ClientEvents.WEBSOCKET_CLOSED)
  }

  public send(payload: string) {
    if (!this.ready) {
      console.warn('Helene: Not Ready')
      console.log({
        ready: this.ready,
        connecting: this.connecting,
        payload,
        uuid: this.client.uuid,
        options: this.client.options,
      })
      console.trace()
      return
    }

    this.socket.send(payload)
  }

  sendSetup() {
    const setup = {
      type: PayloadType.SETUP,
      uuid: this.client.uuid,
    }

    this.send(Presentation.encode(setup))

    this.client.emit(ClientEvents.OUTBOUND_MESSAGE, setup)
  }

  handleOpen() {
    if (!this.socket) return

    this.sendSetup()

    this.client.emit(ClientEvents.WEBSOCKET_CONNECTED)

    this.socket.addEventListener(
      WebSocketEvents.ERROR,
      this.handleError.bind(this),
    )
    this.socket.addEventListener(
      WebSocketEvents.MESSAGE,
      this.handleMessage.bind(this),
    )
    this.socket.addEventListener(
      WebSocketEvents.CLOSE,
      this.handleClose.bind(this),
    )

    this.connecting = false

    this.client.initialize()
  }

  public async handleMessage(data: { data: string }) {
    const payload = Presentation.decode(data)

    if (!payload) return

    this.client.payloadRouter(payload)
  }

  /**
   * This runs if the connection is interrupted or if the server fails to establish a new connection.
   */
  private handleClose = () => {
    this.connecting = false
    this.socket = undefined

    this.client.emit(ClientEvents.WEBSOCKET_CLOSED)
  }

  private handleError = error => {
    this.connecting = false
    console.error(error)
    this.client.emit(ClientEvents.ERROR, error)
  }
}

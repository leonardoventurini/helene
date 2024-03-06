import { Client, WebSocketOptions } from './client'
import {
  ClientEvents,
  HELENE_WS_PATH,
  Presentation,
  WebSocketEvents,
} from '@helenejs/utils'
import { EventEmitter2 } from 'eventemitter2'
import { connectSockJS } from './sockjs'
import PayloadType = Presentation.PayloadType

export const WebSocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
}

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

  async connect() {
    this.stopped = false
    this.connecting = true
    this.client.emit(ClientEvents.CONNECTING)

    connectSockJS(this.uri, this)

    await this.client.waitFor(ClientEvents.WEBSOCKET_CONNECTED)
  }

  public handleMessage(data: { data: string }) {
    const payload = Presentation.decode(data)

    this.client.emit(ClientEvents.INBOUND_MESSAGE, data)

    if (!payload) return

    this.client.payloadRouter(payload)
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
      console.trace()
      return console.warn('Not Ready')
    }

    this.client.emit(ClientEvents.OUTBOUND_MESSAGE, payload)

    this.socket.send(payload)
  }

  handleOpen() {
    if (!this.socket) return

    this.send(
      Presentation.encode({
        type: PayloadType.SETUP,
        uuid: this.client.uuid,
      }),
    )

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

    this.client.init()
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

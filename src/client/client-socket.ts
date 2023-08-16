import { Client, WebSocketOptions } from './client'
import {
  ClientEvents,
  ClientSocketEvent,
  HELENE_WS_PATH,
  sleep,
  WebSocketEvents,
} from '../utils'
import { Presentation } from '../utils/presentation'
import { WebSocketMessageOptions } from '../server'
import {
  connectWebSocketWithPersistentReconnect,
  GenericWebSocket,
} from './websocket'
import { EventEmitter2 } from 'eventemitter2'

export const WebSocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
}

export class ClientSocket extends EventEmitter2 {
  client: Client
  socket: GenericWebSocket

  protocol: string
  uri: string

  ready = false
  connecting = false
  reconnecting = false

  options: WebSocketOptions = {
    autoConnect: true,
    reconnect: true,
    reconnectRetries: 10,
    path: HELENE_WS_PATH,
  }

  constructor(client: Client, options: WebSocketOptions = {}) {
    super()

    this.client = client

    this.client.on(ClientEvents.WEBSOCKET_CONNECTED, this.handleOpen.bind(this))

    Object.assign(this.options, options ?? {})

    this.protocol = this.client.options.secure ? `wss://` : `ws://`

    if (this.client.options.port) {
      this.uri = `${this.protocol}${this.client.options.host}:${this.client.options.port}${this.options.path}`
    } else {
      this.uri = `${this.protocol}${this.client.options.host}${this.options.path}`
    }
  }

  get isOpen(): boolean {
    return Boolean(this.socket?.readyState === WebSocketState.OPEN)
  }

  async connect() {
    this.connecting = true
    this.client.emit(ClientEvents.CONNECTING)

    const { disconnect } = connectWebSocketWithPersistentReconnect(
      `${this.uri}?uuid=${this.client.uuid}`,
      this.client,
    )

    this.once(ClientSocketEvent.DISCONNECT, disconnect)

    await this.client.waitFor(ClientEvents.WEBSOCKET_CONNECTED)
  }

  public handleMessage(data: string | ArrayBuffer | Buffer | Buffer[]) {
    const payload = Presentation.decode(data)

    this.client.emit(ClientEvents.INBOUND_MESSAGE, data)

    if (!payload) return

    this.client.payloadRouter(payload)
  }

  public close() {
    return new Promise<void>(resolve => {
      if (!this.socket) return resolve()

      this.connecting = false

      this.emit(ClientSocketEvent.DISCONNECT)

      this.socket = undefined

      this.client.once(ClientEvents.WEBSOCKET_CLOSED, resolve)
    })
  }

  public send(payload: string, opts?: WebSocketMessageOptions) {
    if (!this.ready) return console.warn('Not Ready')

    this.client.emit(ClientEvents.OUTBOUND_MESSAGE, payload)

    this.socket.send(payload, opts)
  }

  async handleOpen(ws: GenericWebSocket): Promise<void> {
    this.socket = ws

    if (ws.readyState === WebSocketState.CONNECTING) {
      await sleep(10)

      return this.handleOpen(ws)
    }

    this.socket.on(WebSocketEvents.ERROR, this.handleError.bind(this))
    this.socket.on(WebSocketEvents.MESSAGE, this.handleMessage.bind(this))
    this.socket.on(WebSocketEvents.CLOSE, this.handleClose.bind(this))

    this.connecting = false
    this.ready = true
    this.reconnecting = false

    await this.client.init()
  }

  /**
   * This runs if the connection is interrupted or if the server fails to establish a new connection.
   */
  private handleClose = () => {
    this.connecting = false
    this.ready = false
    this.socket = undefined

    this.client.emit(ClientEvents.WEBSOCKET_CLOSED)
  }

  private handleError = error => {
    this.connecting = false
    this.ready = false
    console.error(error)
    this.client.emit(ClientEvents.ERROR, error)
  }
}

import { Client, WebSocketOptions } from './client'
import {
  ClientEvents,
  ClientSocketEvent,
  HELENE_WS_PATH,
  Presentation,
  sleep,
  WebSocketEvents,
  WebSocketState,
} from '@helenejs/utils'
import { connectWebSocketWithPersistentReconnect, Socket } from './websocket'
import { EventEmitter2 } from 'eventemitter2'

export class ClientSocket extends EventEmitter2 {
  client: Client

  socket: Socket

  protocol: string
  uri: string

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

    this.client.on(ClientEvents.WEBSOCKET_CONNECTED, this.handleOpen.bind(this))

    Object.assign(this.options, options ?? {})

    this.protocol = this.client.options.secure ? `https://` : `http://`

    if (this.client.options.port) {
      this.uri = `${this.protocol}${this.client.options.host}:${this.client.options.port}${this.options.path}`
    } else {
      this.uri = `${this.protocol}${this.client.options.host}${this.options.path}`
    }
  }

  async connect() {
    this.connecting = true
    this.client.emit(ClientEvents.CONNECTING)

    connectWebSocketWithPersistentReconnect(
      `${this.uri}?uuid=${this.client.uuid}`,
      this.client,
      this,
    )

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
      // @ts-ignore
      if (this._events.disconnect) {
        this.client.once(ClientEvents.WEBSOCKET_CLOSED, resolve)
        this.emit(ClientSocketEvent.DISCONNECT)
      } else {
        resolve()
      }

      this.connecting = false

      this.socket = undefined
    })
  }

  public send(payload: string) {
    if (!this.ready) return console.warn('Not Ready')

    this.client.emit(ClientEvents.OUTBOUND_MESSAGE, payload)

    this.socket.send(payload)
  }

  async handleOpen(ws: Socket): Promise<void> {
    if (ws.readyState === WebSocketState.CONNECTING) {
      await sleep(10)

      return this.handleOpen(ws)
    }

    this.socket = ws

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

    this.client.init().catch(console.error)
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

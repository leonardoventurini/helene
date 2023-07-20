import { Client, WebSocketOptions } from './client'
import { ClientEvents, HELENE_WS_PATH, sleep, WebSocketEvents } from '../utils'
import { Presentation } from '../utils/presentation'
import { WebSocketMessageOptions } from '../server'
import { connectWithBackoff, GenericWebSocket } from './websocket'

export const WebSocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
}

export class ClientSocket {
  client: Client
  socket: GenericWebSocket

  protocol: string
  uri: string

  closedGracefully = false
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
    this.client = client

    this.client.on(ClientEvents.WEBSOCKET_CONNECTED, this.handleOpen.bind(this))

    Object.assign(this.options, options ?? {})

    this.protocol = this.client.options.secure ? `wss://` : `ws://`

    if (this.client.options.port) {
      this.uri = `${this.protocol}${this.client.options.host}:${this.client.options.port}${this.options.path}`
    } else {
      this.uri = `${this.protocol}${this.client.options.host}${this.options.path}`
    }

    if (this.options.autoConnect)
      setTimeout(() => {
        this.client
          .connect()
          .catch(error => console.error('Auto Connect Error', error))
      }, 0)
    else {
      setTimeout(() => {
        this.client.emit(ClientEvents.INITIALIZED)
      }, 0)
    }
  }

  get readyState(): number {
    return this.socket.readyState
  }

  public handleMessage = ({ data, type, target }) => {
    const payload = Presentation.decode(data)

    this.client.emit(ClientEvents.INBOUND_MESSAGE, data)

    if (!payload) return

    this.client.payloadRouter(payload)
  }

  private handleError = error => {
    this.connecting = false
    this.ready = false
    console.error(error)
    this.client.emit(ClientEvents.ERROR, error)
  }

  /**
   * This runs if the connection is interrupted or if the server fails to establish a new connection.
   */
  private handleClose = ({ code, reason }) => {
    this.client.emit(ClientEvents.CLOSE)
    this.client.emit(ClientEvents.WEBSOCKET_CLOSED)

    if (this.ready)
      setTimeout(() => this.client.emit(ClientEvents.CLOSE, code, reason), 0)

    this.connecting = false
    this.ready = false
    this.socket = undefined

    this.client.clientHttp.createEventSource().catch(console.error)
  }

  public close(force = false) {
    return new Promise<void>(resolve => {
      if (!this.socket) resolve()

      if (force) {
        this.socket.close()
      } else {
        this.closedGracefully = true
        this.socket.close(1000, 'Closed Gracefully')
      }

      this.client.once(ClientEvents.CLOSE, resolve)
    })
  }

  public send(payload: string, opts?: WebSocketMessageOptions) {
    if (!this.ready) return console.warn('Not Ready')

    this.client.emit(ClientEvents.OUTBOUND_MESSAGE, payload)

    this.socket.send(payload, opts)
  }

  async connect() {
    this.connecting = true
    this.closedGracefully = false
    this.client.emit(ClientEvents.CONNECTING)

    await connectWithBackoff(
      `${this.uri}?uuid=${this.client.uuid}`,
      this.client,
    )
  }

  async handleOpen(ws: GenericWebSocket): Promise<void> {
    this.socket = ws

    if (ws.readyState === WebSocketState.CONNECTING) {
      await sleep(10)

      return this.handleOpen(ws)
    }

    this.client.clientHttp.clientEventSource?.close()

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
    this.ready = true
    this.reconnecting = false

    await this.client.init()
  }
}

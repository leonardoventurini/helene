import IsomorphicWebSocket from 'isomorphic-ws'
import { Client, WebSocketOptions } from './client'
import { ClientEvents, WebSocketEvents } from '../constants'
import { Presentation } from '../server/presentation'
import { WebSocketMessageOptions } from '../server/transports/websocket-transport'
import retry from 'retry'

export class ClientSocket {
  client: Client
  socket: IsomorphicWebSocket

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
  }

  constructor(client: Client, options: WebSocketOptions = {}) {
    this.client = client
    this.options = { ...this.options, ...options }

    this.protocol = this.client.secure ? `wss://` : `ws://`

    if (this.client.port) {
      this.uri = `${this.protocol}${this.client.host}:${this.client.port}/`
    } else {
      this.uri = `${this.protocol}${this.client.host}/`
    }

    if (this.options.autoConnect)
      this.connect().catch(error => console.error('Auto Connect Error', error))
  }

  private handleOpen = () => {
    this.client.emit(ClientEvents.OPEN)
    this.connecting = false
    this.ready = true
    this.reconnecting = false
  }

  private handleMessage = ({ data, type, target }) => {
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

  private reconnect() {
    if (!this.options.reconnect) return
    if (this.reconnecting) return

    this.reconnecting = true

    const operation = retry.operation({
      retries: this.options.reconnectRetries,
      factor: 1.5,
      minTimeout: 1000,
      maxTimeout: 60 * 1000,
      randomize: true,
    })

    operation.attempt(currentAttempt => {
      console.log('[Helene] Reconnecting...', currentAttempt)
      this.connect().catch(error => {
        if (operation.retry(error)) return

        console.error('[Helene] Reconnect Failed', operation.mainError())
      })
    })
  }

  /**
   * This runs if the connection is interrupted or if the server fails to establish a new connection.
   */
  private handleClose = ({ code, reason }) => {
    this.client.emit(ClientEvents.CLOSE)

    if (this.ready)
      setTimeout(() => this.client.emit(ClientEvents.CLOSE, code, reason), 0)

    this.connecting = false
    this.ready = false
    this.socket = undefined

    if (code === 1000) return

    if (this.closedGracefully) return

    this.reconnect()
  }

  public close(code?: number, data?: string) {
    return new Promise<void>(resolve => {
      if (!this.socket) resolve()

      this.closedGracefully = true
      this.socket.close(code ?? 1000, data)
      this.client.once(ClientEvents.CLOSE, resolve)
    })
  }

  public send(payload: string, opts?: WebSocketMessageOptions) {
    if (!this.ready) return console.warn('Not Ready')

    this.client.emit(ClientEvents.OUTBOUND_MESSAGE, payload)

    this.socket.send(payload, opts)
  }

  public async connect(): Promise<void> {
    this.connecting = true
    this.client.emit(ClientEvents.CONNECTING)

    this.closedGracefully = false

    return new Promise((resolve, reject) => {
      this.socket = new IsomorphicWebSocket(this.uri)

      this.socket.addEventListener(WebSocketEvents.OPEN, () => {
        this.handleOpen()
        resolve()
      })

      this.socket.addEventListener(WebSocketEvents.ERROR, error => {
        this.handleError(error)
        reject(error)
      })

      this.socket.addEventListener(WebSocketEvents.MESSAGE, this.handleMessage)
      this.socket.addEventListener(WebSocketEvents.CLOSE, this.handleClose)
    })
  }
}

import IsomorphicWebSocket from 'isomorphic-ws'
import { Client, WebSocketOptions } from './client'
import { ClientEvents, WebSocketEvents } from '../constants'
import { Presentation } from '../server/presentation'
import { WebSocketMessageOptions } from '../server/transports/websocket-transport'

export class ClientSocket {
  client: Client
  socket: IsomorphicWebSocket

  protocol: string
  uri: string

  autoConnect: boolean
  maxReconnects: number
  reconnect: boolean
  reconnectInterval: number
  currentReconnects = 0

  closedGracefully = false
  ready = false
  connecting = false

  constructor(
    client: Client,
    {
      autoConnect = true,
      reconnect = true,
      reconnectInterval = 5000,
      maxReconnects = 10,
    }: WebSocketOptions = {},
  ) {
    this.client = client
    this.autoConnect = autoConnect
    this.maxReconnects = maxReconnects
    this.reconnect = reconnect
    this.reconnectInterval = reconnectInterval

    this.protocol = this.client.secure ? `wss://` : `ws://`

    if (this.client.port) {
      this.uri = `${this.protocol}${this.client.host}:${this.client.port}/`
    } else {
      this.uri = `${this.protocol}${this.client.host}/`
    }

    if (this.autoConnect)
      this.connect().catch(error => console.error('Auto Connect Error', error))
  }

  private handleOpen = () => {
    this.client.emit(ClientEvents.OPEN)
    this.connecting = false
    this.ready = true
    this.currentReconnects = 0
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

  private handleClose = ({ code, reason }) => {
    this.client.emit(ClientEvents.CLOSE)

    this.client.debugger('Closing Socket', code, reason)

    if (this.ready)
      setTimeout(() => this.client.emit(ClientEvents.CLOSE, code, reason), 0)

    this.connecting = false
    this.ready = false
    this.socket = undefined

    if (code === 1000) return

    if (this.closedGracefully) return

    this.currentReconnects++

    if (
      this.reconnect &&
      (this.maxReconnects > this.currentReconnects || this.maxReconnects === 0)
    ) {
      setTimeout(
        () => this.connect().catch(console.error),
        this.reconnectInterval,
      )
    }
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

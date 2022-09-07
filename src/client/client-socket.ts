import IsomorphicWebSocket from 'isomorphic-ws'
import { Client, WebSocketOptions } from './client'
import { ClientEvents, WebSocketEvents } from '../constants'
import { Presentation } from '../server/presentation'
import { WebSocketMessageOptions } from '../server/transports/websocket-transport'
import { fromEvent, Observable } from 'rxjs'

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

  open$: Observable<any>
  message$: Observable<any>
  error$: Observable<any>
  close$: Observable<any>

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

    if (this.client.port)
      this.uri = `${this.protocol}${this.client.host}:${this.client.port}${this.client.namespace}`
    else {
      this.uri = `${this.protocol}${this.client.host}${this.client.namespace}`
    }

    if (this.autoConnect) this.connect()
  }

  connect() {
    this.closedGracefully = false
    this.socket = new IsomorphicWebSocket(this.uri)

    this.open$ = fromEvent(this.socket, WebSocketEvents.OPEN)
    this.message$ = fromEvent(this.socket, WebSocketEvents.MESSAGE)
    this.error$ = fromEvent(this.socket, WebSocketEvents.ERROR)
    this.close$ = fromEvent(this.socket, WebSocketEvents.CLOSE)

    this.open$.subscribe(this.handleOpen)
    this.message$.subscribe(this.handleMessage)
    this.error$.subscribe(this.handleError)
    this.close$.subscribe(this.handleClose)
  }

  close(code?: number, data?: string) {
    return new Promise<void>(resolve => {
      if (!this.socket) resolve()

      this.closedGracefully = true
      this.socket.close(code ?? 1000, data)
      this.client.once(ClientEvents.CLOSE, resolve)
    })
  }

  send(payload: string, opts?: WebSocketMessageOptions) {
    if (!this.ready) return console.warn('Not Ready')

    this.client.emit(ClientEvents.OUTBOUND_MESSAGE, payload)

    this.socket.send(payload, opts)
  }

  handleOpen = () => {
    this.ready = true
    this.currentReconnects = 0

    this.client.emit(ClientEvents.OPEN)
  }

  handleMessage = ({ data, type, target }) => {
    const payload = Presentation.decode(data)

    this.client.emit(ClientEvents.INBOUND_MESSAGE, data)

    if (!payload) return

    this.client.payloadRouter(payload)
  }

  handleError = error => {
    console.error(error)
    this.client.emit(ClientEvents.ERROR, error)
  }

  handleClose = ({ code, reason }) => {
    this.client.debugger('Closing Socket', code, reason)

    if (this.ready)
      setTimeout(() => this.client.emit(ClientEvents.CLOSE, code, reason), 0)

    this.ready = false
    this.socket = undefined

    if (code === 1000) return

    if (this.closedGracefully) return

    this.currentReconnects++

    if (
      this.reconnect &&
      (this.maxReconnects > this.currentReconnects || this.maxReconnects === 0)
    ) {
      setTimeout(() => this.connect(), this.reconnectInterval)
    }
  }
}

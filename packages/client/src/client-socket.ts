import { Client, WebSocketOptions } from './client'
import { ClientEvents, HELENE_WS_PATH, Presentation } from '@helenejs/utils'
import { EventEmitter2 } from 'eventemitter2'
import { io, Socket } from 'socket.io-client'
import defer from 'lodash/defer'

export const WebSocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
}

export class ClientSocket extends EventEmitter2 {
  client: Client
  socket: Socket

  protocol: string
  uri: string
  stopped = false

  connecting = false

  options: WebSocketOptions = {
    path: HELENE_WS_PATH,
  }

  baseAttemptDelay = 1000
  maxAttemptDelay = 10000
  attempts = 0

  get ready() {
    return this.socket?.connected ?? false
  }

  constructor(client: Client, options: WebSocketOptions = {}) {
    super()

    this.client = client

    Object.assign(this.options, options ?? {})

    this.protocol = this.client.options.secure ? 'https://' : 'http://'

    if (this.client.options.port) {
      this.uri = `${this.protocol}${this.client.options.host}:${this.client.options.port}`
    } else {
      this.uri = `${this.protocol}${this.client.options.host}`
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ready) {
        return resolve(this.socket)
      }

      this.stopped = false
      this.connecting = true
      this.client.emit(ClientEvents.CONNECTING)

      this.socket = io(this.uri, {
        path: this.options.path,
        query: {
          uuid: this.client.uuid,
        },
        reconnection: false,
      })

      this.socket.on('connect', () => {
        defer(() => {
          console.log('Helene: WebSocket Connected')
          resolve(this.socket)
          this.connecting = false
          this.attempts = 0
          this.client.emit(ClientEvents.WEBSOCKET_CONNECTED)
          this.client.initialize().catch(console.error)
        })
      })

      this.socket.on('connect_error', error => {
        console.log('Helene: WebSocket Connect Error', error)
        this.socket = undefined
        this.reconnect()
      })

      this.socket.on('error', error => {
        console.error('Helene: WebSocket Error', error)
        this.socket = undefined
        this.reconnect()
      })

      this.socket.on('message', (data: { data: string }) => {
        const payload = Presentation.decode(data)

        this.client.emit(ClientEvents.INBOUND_MESSAGE, data)

        if (!payload) return

        this.client.payloadRouter(payload)
      })

      this.socket.on('disconnect', () => {
        console.log('Helene: WebSocket Disconnected')

        this.connecting = false

        defer(() => {
          this.socket = undefined
          this.client.emit(ClientEvents.WEBSOCKET_CLOSED)

          if (!this.stopped) {
            this.reconnect()
          }
        })
      })
    })
  }

  reconnect() {
    this.attempts++

    setTimeout(
      () => {
        if (this.stopped) return

        this.client.emit(ClientEvents.WEBSOCKET_RECONNECTING)

        this.connect().catch(console.error)
      },
      Math.min(this.baseAttemptDelay * this.attempts, this.maxAttemptDelay),
    )
  }

  async close() {
    this.stopped = true
    this.connecting = false

    if (!this.socket) return

    this.socket.disconnect()
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

    this.client.emit(ClientEvents.OUTBOUND_MESSAGE, payload)

    this.socket.send(payload)
  }
}

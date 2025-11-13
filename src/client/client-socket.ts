import {
  ClientEvents,
  HELENE_WS_PATH,
  HeleneEvents,
  PayloadType,
  Presentation,
} from '../utils'
import { EventEmitter2 } from 'eventemitter2'
import defer from 'lodash/defer'
import { io, Socket } from 'socket.io-client'
import { Client, WebSocketOptions } from './client'

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
    if (this.ready) {
      console.warn('Helene: Already Connected')
      return
    }

    this.stopped = false
    this.connecting = true
    this.client.emit(ClientEvents.CONNECTING)

    this.socket = io(this.uri, {
      path: this.options.path,
      query: {
        uuid: this.client.uuid,
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
    })

    this.socket.on('connect', () => {
      this.handleOpen()
    })

    this.socket.on('reconnect', () => {
      this.handleOpen()
    })

    this.socket.on('disconnect', reason => {
      this.client.initialized = false
      this.client.initializing = false

      this.client.emit(ClientEvents.WEBSOCKET_CLOSED)

      if (this.stopped) {
        this.socket = undefined
        return
      }
    })

    this.socket.on('error', this.handleError.bind(this))
    this.socket.on('message', this.handleMessage.bind(this))
  }

  async close() {
    this.stopped = true
    this.connecting = false

    defer(() => {
      if (!this.socket) {
        this.client.emit(ClientEvents.WEBSOCKET_CLOSED)
        return
      }
      this.socket.close()
      this.socket = undefined
    })

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

    this.connecting = false

    this.client.initialize()
  }

  public async handleMessage(data: { data: string }) {
    const payload = Presentation.decode(data)

    if (!payload) return

    if (payload.type === PayloadType.HEARTBEAT && Client.ENABLE_HEARTBEAT) {
      this.send(Presentation.encode({ type: PayloadType.HEARTBEAT }))
      this.client.emit(HeleneEvents.HEARTBEAT)
      return
    }

    this.client.payloadRouter(payload)
  }

  private handleError = error => {
    this.connecting = false
    console.error(error)
    this.client.emit(ClientEvents.ERROR, error)
  }
}

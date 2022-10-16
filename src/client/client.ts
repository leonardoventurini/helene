import { WebSocketMessageOptions } from '../server/transports/websocket-transport'
import { PromiseQueue } from './promise-queue'
import { ClientSocket } from './client-socket'
import { Presentation } from '../server/presentation'
import { MethodParams } from '../server/method'
import {
  isEmpty,
  isFunction,
  isObject,
  isPlainObject,
  isString,
  last,
  merge,
  pick,
} from 'lodash'
import { ClientEvents, NO_CHANNEL, TOKEN_HEADER_KEY } from '../constants'
import { ClientHttp } from './client-http'
import { ClientChannel } from './client-channel'
import axios from 'axios'
import { Errors } from '../errors'
import qs from 'query-string'
import { Methods } from '../server/methods'
import { Environment } from '../utils/environment'
import { EJSON } from 'ejson2'
import Timeout = NodeJS.Timeout

export type ErrorHandler = (error: Presentation.ErrorPayload) => any

export type WebSocketOptions = {
  autoConnect?: boolean
  reconnect?: boolean

  /**
   * @todo Implement backoff.
   */
  reconnectInterval?: number
  maxReconnects?: number
}

export type WebSocketRequestParams = {
  [x: string]: any
  [x: number]: any
}

export type ClientOptions = {
  host?: string
  port?: number
  secure?: boolean
  ws?: WebSocketOptions
  errorHandler?: ErrorHandler
  debug?: boolean
  allowedContextKeys?: string[]
}

export type CallOptions = {
  http?: boolean
  timeout?: number
  ws?: WebSocketMessageOptions
}

/**
 * When working with Next.js it is probably a good idea to not run this in the
 * server side by using it inside a `useEffect` hook.
 */
export class Client extends ClientChannel {
  uuid: string

  queue: PromiseQueue
  clientSocket: ClientSocket
  clientHttp: ClientHttp
  context: Record<string, any> = {}
  errorHandler: ErrorHandler

  debug: boolean
  host: string
  port: number
  secure: boolean

  channels: Map<string, ClientChannel> = new Map()

  timeouts: Set<Timeout> = new Set()
  keepAliveInterval: Timeout = null

  allowedContextKeys: string[] = []

  ready = false
  axios = axios

  constructor({
    host = 'localhost',
    port,
    secure = false,
    errorHandler = null,
    ws,
    debug = false,
    allowedContextKeys = [],
  }: ClientOptions = {}) {
    super(NO_CHANNEL)

    this.uuid = Presentation.uuid()

    this.setClient(this)

    this.debug = debug
    this.host = host
    this.port = port
    this.secure = secure
    this.errorHandler = errorHandler
    this.clientSocket = new ClientSocket(this, ws)
    this.clientHttp = new ClientHttp(this)
    this.queue = new PromiseQueue()
    this.allowedContextKeys = allowedContextKeys

    this.channels.set(NO_CHANNEL, this)

    this.loadContext().catch(console.error)

    this.on(ClientEvents.OPEN, this.init)
    this.on(ClientEvents.ERROR, console.error)

    this.debugger('Client Created', this.uuid)

    if (Environment.isDevelopment && Environment.isBrowser) {
      // @ts-ignore
      window.Helene = this
      this.attachDevTools().then(() => {
        this.debugger('DevTools attached')
      })
    }
  }

  get isConnecting() {
    return !!this.clientSocket?.connecting
  }

  get isOffline() {
    return !this.clientSocket?.ready
  }

  get isOnline() {
    return !!this.clientSocket?.ready
  }

  get authenticated() {
    return !!this.context?.token
  }

  debugger(...args) {
    if (this.debug) console.debug(...args)
  }

  async loadContext() {
    if (typeof localStorage === 'undefined') return
    const context = localStorage.getItem('context')
    if (!context) return
    await this.updateContext(EJSON.parse(context), false)
  }

  async setContext(context: Record<string, any>, reinitialize = true) {
    this.context = context

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('context', EJSON.stringify(context))
    }

    this.emit(ClientEvents.CONTEXT_CHANGED)

    if (reinitialize) await this.init()
  }

  async updateContext(context, reinitialize = true) {
    const newContext = merge({}, this.context, context)

    await this.setContext(newContext, reinitialize)
  }

  clearContext() {
    this.context = {}

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('context')
    }

    this.emit(ClientEvents.CONTEXT_CHANGED)
  }

  async connect() {
    await this.clientSocket.connect()

    return await this.isReady()
  }

  async close() {
    this.timeouts.forEach(timeout => clearTimeout(timeout))

    clearTimeout(this.keepAliveInterval)

    return this.clientSocket.close()
  }

  async init() {
    this.debugger('Init Client', this.uuid)

    await this.loadContext()

    this.ready = false

    this.emit(ClientEvents.INITIALIZING)

    const { token } = this.context ?? {}

    if (token && !isString(token)) throw new Error(Errors.INVALID_TOKEN)

    const context = this.allowedContextKeys.length
      ? pick(this.context ?? {}, this.allowedContextKeys)
      : { token }

    const result = await this.call(Methods.RPC_INIT, {
      token,
      ...context,
    })

    await this.updateContext(result || {}, false)

    await this.resubscribeAllChannels()

    this.ready = true

    this.debugger('Authentication Changed', result)

    if (token) {
      axios.defaults.headers.common = {
        [TOKEN_HEADER_KEY]: token,
      }
    }

    clearInterval(this.keepAliveInterval)

    this.keepAliveInterval = setInterval(() => {
      this.call(Methods.KEEP_ALIVE).catch(console.error)
    }, 20000)

    this.emit(ClientEvents.INITIALIZED, result)
    this.emit(ClientEvents.AUTH_CHANGED, result)
  }

  async login(params: WebSocketRequestParams, opts?: CallOptions) {
    const response = await this.call(Methods.RPC_LOGIN, params, opts)

    if (!response || isEmpty(response)) {
      throw new Error(Errors.AUTHENTICATION_FAILED)
    }

    if (isPlainObject(response)) {
      await this.updateContext(response)
    }
  }

  async logout() {
    await this.call(Methods.RPC_LOGOUT)
    this.clearContext()
    this.emit(ClientEvents.AUTH_CHANGED, false)
  }

  async resubscribeAllChannels() {
    for (const [name, channel] of this.channels) {
      await channel.resubscribe()
    }
  }

  /**
   * Calls a method without expecting a return value.
   */
  void(
    method: string,
    params?: MethodParams,
    { ws, http }: CallOptions = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const uuid = Presentation.uuid()

      const payload = {
        uuid,
        method,
        params,
        void: true,
      }

      if (http) {
        return this.clientHttp.request(payload, null, reject)
      }

      this.clientSocket.socket.send(
        Presentation.Inbound.call(payload),
        ws,
        (error: any) => {
          if (error) return reject(error)

          resolve()
        },
      )
    })
  }

  /**
   * Calls a method and wait asynchronously for a value.
   */
  async call(
    method: string,
    params?: MethodParams,
    { timeout = 20000, ws, http }: CallOptions = {},
  ): Promise<any> {
    this.debugger(`Calling ${method}`, params)

    return new Promise((resolve, reject) => {
      const uuid = Presentation.uuid()

      const payload = { uuid, method, params }

      if (http || !this.clientSocket.ready) {
        return this.clientHttp.request(payload, resolve, reject)
      }

      this.clientSocket.send(Presentation.Inbound.call(payload), ws)

      const timeoutId = setTimeout(() => {
        const promise = this.queue.dequeue(uuid)

        promise.reject(new Error('Result Timeout'))
      }, timeout)

      this.timeouts.add(timeoutId)

      this.queue.enqueue(uuid, {
        method,
        resolve,
        reject: this.errorHandler
          ? error => {
              this.errorHandler(error)
              reject(error)
            }
          : reject,
        timeoutId,
      })
    })
  }

  handleError(payload: Presentation.ErrorPayload) {
    if (payload.uuid) {
      const promise = this.queue.dequeue(payload.uuid)

      if (!promise) {
        if (this.errorHandler) {
          this.errorHandler(payload)
        }

        return
      }

      promise.reject(payload)
      clearTimeout(promise.timeoutId)
      this.timeouts.delete(promise.timeoutId)
    }
  }

  handleEvent(payload: Presentation.EventPayload) {
    this.debugger('Event Received', payload)
    return this.channel(payload.channel).emit(payload.event, payload.params)
  }

  handleResult(payload: Presentation.MethodResultPayload) {
    const promise = this.queue.dequeue(payload.uuid)

    if (!promise) return

    clearTimeout(promise.timeoutId)
    this.timeouts.delete(promise.timeoutId)

    promise.resolve(payload.result)
  }

  payloadRouter(payload: Presentation.Payload) {
    switch (payload.type) {
      case Presentation.PayloadType.ERROR:
        return this.handleError(payload)
      case Presentation.PayloadType.EVENT:
        return this.handleEvent(payload)
      case Presentation.PayloadType.RESULT:
        return this.handleResult(payload)
    }
  }

  /**
   * Generates a URL path from string parts. The last argument can be a query
   * string object definition.
   */
  href(...path: (string | Record<string, any>)[]) {
    let queryString = ''

    if (isPlainObject(last(path))) {
      const params = path.pop()
      queryString = '?'.concat(qs.stringify(params as any))
    }

    if (path.some(isPlainObject))
      throw new Error('Parameters are only allowed in the last argument.')

    return `${this.clientHttp.host}/${path
      .join('/')
      .replace(/^\/|\/{2,}/, '')}${queryString}`
  }

  channel(name: string | object = NO_CHANNEL) {
    if (
      isObject(name) &&
      name.constructor.name === 'ObjectId' &&
      isFunction(name.toString)
    ) {
      name = name.toString()
    }

    if (!name || !isString(name)) return null
    if (name === NO_CHANNEL) return this

    if (this.channels.has(name)) return this.channels.get(name)

    const channel = new ClientChannel(name)
    channel.setClient(this)

    this.channels.set(name, channel)

    return channel
  }

  isReady() {
    return new Promise(resolve => {
      if (this.ready) return resolve(true)

      this.once(ClientEvents.INITIALIZED, () => resolve(true))
    })
  }

  async attachDevTools() {
    const generateId = () => (Date.now() + Math.random()).toString(36)

    await this.subscribe(ClientEvents.DEBUGGER)

    this.on(ClientEvents.OUTBOUND_MESSAGE, content => {
      // @ts-ignore
      window.__helene_devtools_log_message?.({
        id: generateId(),
        content,
        isOutbound: true,
        timestamp: Date.now(),
      })
    })

    this.on(ClientEvents.INBOUND_MESSAGE, content => {
      // @ts-ignore
      window.__helene_devtools_log_message?.({
        id: generateId(),
        content,
        isInbound: true,
        timestamp: Date.now(),
      })
    })
  }
}

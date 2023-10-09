import { MethodParams, WebSocketMessageOptions } from '@helenejs/server'
import {
  ClientEvents,
  Environment,
  Errors,
  HeleneEvents,
  Methods,
  NO_CHANNEL,
  Presentation,
  PromiseQueue,
  TOKEN_HEADER_KEY,
} from '@helenejs/utils'
import { ClientSocket } from './client-socket'
import isEmpty from 'lodash/isEmpty'
import isPlainObject from 'lodash/isPlainObject'
import isString from 'lodash/isString'
import merge from 'lodash/merge'
import pick from 'lodash/pick'
import last from 'lodash/last'
import isObject from 'lodash/isObject'
import isFunction from 'lodash/isFunction'
import { ClientHttp } from './client-http'
import { ClientChannel } from './client-channel'
import qs from 'query-string'
import { EJSON } from 'ejson2'
import { IdleTimeout } from './idle-timeout'
import isNumber from 'lodash/isNumber'
import { KeepAlive } from './keep-alive'
import Timeout = NodeJS.Timeout

export type ErrorHandler = (error: Presentation.ErrorPayload) => any

export type WebSocketOptions = {
  path?: string
}

export type WebSocketRequestParams = {
  [x: string]: any
  [x: number]: any
}

/**
 * Declarative way to define transport mode. Can be changed at runtime.
 */
export enum TransportMode {
  /**
   * HTTP Only. No reactivity, no real-time, no nothing. Just plain old HTTP requests.
   */
  HttpOnly = 'HTTP_ONLY',

  /**
   * Server-Sent Events. It is a one-way communication channel from the server + HTTP calls.
   */
  HttpSSE = 'HTTP_SSE',

  /**
   * WebSocket. It is a two-way communication channel.
   */
  WebSocket = 'WEBSOCKET',
}

export type ClientOptions = {
  host?: string
  port?: number
  mode?: TransportMode
  secure?: boolean
  ws?: WebSocketOptions
  errorHandler?: ErrorHandler
  debug?: boolean
  allowedContextKeys?: string[]
  meta?: Record<string, any>
  idlenessTimeout?: number
}

export type CallOptions = {
  http?: boolean
  timeout?: number
  ws?: WebSocketMessageOptions
  httpFallback?: boolean
}

/**
 * When working with Next.js, it is probably a good idea to not run this in the
 * server side by using it inside a `useEffect` hook.
 */
export class Client extends ClientChannel {
  uuid: string

  queue: PromiseQueue
  clientSocket: ClientSocket
  clientHttp: ClientHttp
  context: Record<string, any> = {}
  errorHandler: ErrorHandler

  channels: Map<string, ClientChannel> = new Map()

  timeouts: Set<Timeout> = new Set()

  initialized = false

  authenticated = false

  options: ClientOptions = {
    host: 'localhost',
    mode: TransportMode.WebSocket,
    secure: false,
    errorHandler: null,
    debug: false,
    allowedContextKeys: [],
    meta: {},
  }

  initializing: boolean

  keepAlive: KeepAlive = new KeepAlive(this)

  idleTimeout: IdleTimeout = null

  static KEEP_ALIVE_INTERVAL = 10000
  static EVENT_PROBE_TIMEOUT = 2000

  constructor(options: ClientOptions = {}) {
    super(NO_CHANNEL)

    this.uuid = Presentation.uuid()

    this.setClient(this)

    this.options = merge(this.options, options)

    this.clientHttp = new ClientHttp(this)
    this.queue = new PromiseQueue()

    this.channels.set(NO_CHANNEL, this)

    /**
     * The client should only ever be ready when the context is loaded,
     * scheduling the client socket construction for after the context
     * is first loaded does the trick as the init event is only emitted after
     * the ClientSocket is built.
     */
    this.loadContext()

    this.authenticated = !!this.context.token

    this.clientSocket = new ClientSocket(this, this.options.ws)

    this.on(ClientEvents.ERROR, console.error)

    if (Environment.isBrowser) {
      if (Environment.isDevelopment) {
        // @ts-ignore
        window.Helene = this
      }

      this.attachDevTools().then(() => {
        this.debugger('DevTools attached')
      })
    }

    this.connect().catch(console.error)

    if (
      isNumber(this.options.idlenessTimeout) &&
      (Environment.isBrowser || Environment.isTest)
    ) {
      this.idleTimeout = new IdleTimeout(this.options.idlenessTimeout, this)
    }
  }

  mode = {
    options: this.options,

    get http() {
      return this.options.mode === TransportMode.HttpOnly
    },

    get eventsource() {
      return this.options.mode === TransportMode.HttpSSE
    },

    get websocket() {
      return this.options.mode === TransportMode.WebSocket
    },
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

  get connected() {
    return this.initialized && this.clientSocket?.ready
  }

  async connect() {
    if (!(await this.shouldConnect())) {
      console.log('Helene: Already connected')
      return
    }

    if (this.mode.eventsource) {
      await this.clientHttp.createEventSource()
      return
    }

    if (this.mode.websocket) {
      await this.clientSocket.connect()
      return
    }

    // Init is called automatically once the respective connection mode is ready, we only call here if it is HTTP only.
    await this.init()
  }

  /**
   * Workaround for Safari not reconnecting after the app is brought back to the foreground.
   */
  async shouldConnect() {
    if (this.mode.eventsource && !this.clientHttp.isEventSourceConnected)
      return true
    if (this.mode.websocket && !this.clientSocket.ready) return true

    try {
      this.call(Methods.EVENT_PROBE).catch(console.error)
      await this.waitFor(HeleneEvents.EVENT_PROBE, Client.EVENT_PROBE_TIMEOUT)
      return false
    } catch {
      console.error('Helene: Event Probe Failed')
      this.emit(HeleneEvents.EVENT_PROBE_FAILED)
      await this.close()
      return true
    }
  }

  debugger(...args) {
    if (this.options.debug) console.debug(...args)
  }

  loadContext() {
    if (typeof localStorage === 'undefined') return
    const context = localStorage.getItem('context')
    if (!context) return
    this.updateContext(EJSON.parse(context))
  }

  setContext(context: Record<string, any>) {
    this.context = context

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('context', EJSON.stringify(context))
    }

    this.emit(ClientEvents.CONTEXT_CHANGED)
  }

  async setContextAndReInit(context: Record<string, any>) {
    this.setContext(context)

    await this.init()
  }

  updateContext(context) {
    const newContext = merge({}, this.context, context)

    this.setContext(newContext)
  }

  clearContext() {
    this.context = {}

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('context')
    }

    this.emit(ClientEvents.CONTEXT_CHANGED)
  }

  async close() {
    this.emit(ClientEvents.CLOSE)

    this.clientHttp.close()

    this.timeouts.forEach(timeout => clearTimeout(timeout))

    // Clear event sub/unsub timeouts.
    this.channels.forEach(channel => {
      channel.emit(HeleneEvents.COMMIT_PENDING_SUBSCRIPTIONS, {})
    })

    this.channels.forEach(channel => {
      channel.emit(HeleneEvents.COMMIT_PENDING_UNSUBSCRIPTIONS, {})
    })

    await this.clientSocket.close()
  }

  async init() {
    if (this.initializing) return

    this.initializing = true

    this.initialized = false

    this.loadContext()

    this.emit(ClientEvents.INITIALIZING)

    const { token } = this.context ?? {}

    if (token && !isString(token)) throw new Error(Errors.INVALID_TOKEN)

    const context = this.options.allowedContextKeys.length
      ? pick(this.context ?? {}, this.options.allowedContextKeys)
      : {}

    const result = await this.call(Methods.RPC_INIT, {
      token,
      meta: this.options.meta,
      ...context,
    })

    /**
     * It needs to validate the token first as it can be invalid
     */
    this.authenticated = Boolean(result)

    if (result) {
      this.updateContext({ ...result, initialized: true })
    } else {
      this.clearContext()
    }

    this.initialized = true
    this.initializing = false

    await this.resubscribeAllChannels()

    if (this.mode.websocket || this.mode.eventsource) {
      this.keepAlive.start()
    }

    this.emit(ClientEvents.INITIALIZED, result)
  }

  async login(params: WebSocketRequestParams, opts?: CallOptions) {
    const response = await this.call(Methods.RPC_LOGIN, params, opts)

    if (!response || isEmpty(response)) {
      throw new Error(Errors.AUTHENTICATION_FAILED)
    }

    if (isPlainObject(response)) {
      await this.setContextAndReInit(response)
    }
  }

  async logout() {
    await this.call(Methods.RPC_LOGOUT)
    this.authenticated = false
    this.clearContext()
    this.emit(ClientEvents.LOGOUT, false)
  }

  async resubscribeAllChannels() {
    for (const [, channel] of this.channels) {
      await channel.resubscribe()
    }
  }

  async disconnect() {
    return this.close()
  }

  /**
   * Calls a method without expecting a return value.
   */
  void(
    method: string,
    params?: MethodParams,
    { ws, http, httpFallback = true }: CallOptions = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const uuid = Presentation.uuid()

      const payload = {
        uuid,
        method,
        params,
        void: true,
      }

      if (http || (!this.clientSocket.ready && httpFallback)) {
        return this.clientHttp.request(payload, null, reject)
      }

      this.clientSocket.send(Presentation.Inbound.call(payload), ws)

      resolve()
    })
  }

  /**
   * Calls a method and wait asynchronously for a value.
   */
  async call(
    method: string,
    params?: MethodParams,
    { timeout = 20000, ws, http, httpFallback = true }: CallOptions = {},
  ): Promise<any> {
    // @todo perhaps should probe the connection here and reconnect if necessary?

    // It should wait for the client to initialize before calling any method.
    if (!this.initialized && method !== Methods.RPC_INIT) {
      try {
        await this.waitFor(ClientEvents.INITIALIZED, Math.floor(timeout / 2))
      } catch {
        throw new Error('client not initialized')
      }
    }

    return new Promise((resolve, reject) => {
      const uuid = Presentation.uuid()

      const payload = { uuid, method, params }

      // It should call the method via HTTP if the socket is not ready or the initialization did not occur yet.
      if (http || (!this.clientSocket.ready && httpFallback)) {
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

  isConnected() {
    return new Promise(resolve => {
      if (this.connected) return resolve(true)

      this.once(ClientEvents.INITIALIZED, () => resolve(true))
    })
  }

  async attachDevTools() {
    const generateId = () => (Date.now() + Math.random()).toString(36)

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

  fetch(url: string, options: any) {
    return fetch(
      url,
      merge(
        {
          headers: {
            [TOKEN_HEADER_KEY]: this.context.token,
          },
        },
        options,
      ),
    )
  }
}

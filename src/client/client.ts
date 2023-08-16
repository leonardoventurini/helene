import { MethodParams, WebSocketMessageOptions } from '../server'
import { PromiseQueue } from './promise-queue'
import { ClientSocket } from './client-socket'
import { Presentation } from '../utils/presentation'
import {
  isEmpty,
  isFunction,
  isObject,
  isPlainObject,
  isString,
  last,
  merge,
  pick,
  throttle,
} from 'lodash'
import {
  ClientEvents,
  Environment,
  Errors,
  HeleneEvents,
  Methods,
  NO_CHANNEL,
  TOKEN_HEADER_KEY,
} from '../utils'
import { ClientHttp } from './client-http'
import { ClientChannel } from './client-channel'
import qs from 'query-string'
import { EJSON } from 'ejson2'
import { Collection, CollectionOptions, createCollection } from '../data'
import Timeout = NodeJS.Timeout

export type ErrorHandler = (error: Presentation.ErrorPayload) => any

export type WebSocketOptions = {
  autoConnect?: boolean
  reconnect?: boolean
  reconnectRetries?: number
  path?: string
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
  meta?: Record<string, any>
  idlenessTimeout?: number
  eventSource?: boolean
}

export type CallOptions = {
  http?: boolean
  timeout?: number
  ws?: WebSocketMessageOptions
  httpFallback?: boolean
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

  channels: Map<string, ClientChannel> = new Map()

  timeouts: Set<Timeout> = new Set()

  initialized = false

  authenticated = false

  collections: Map<string, Collection> = new Map()

  options: ClientOptions = {
    host: 'localhost',
    secure: false,
    errorHandler: null,
    debug: false,
    allowedContextKeys: [],
    meta: {},
    eventSource: true,
  }

  keepAliveTimeout: Timeout = null

  idleTimeout: Timeout = null

  initializing: boolean

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

    this.debugger('Client Created', this.uuid)

    if (Environment.isBrowser) {
      if (Environment.isDevelopment) {
        // @ts-ignore
        window.Helene = this
      }

      this.attachDevTools().then(() => {
        this.debugger('DevTools attached')
      })
    }

    // If it is going to connect with WebSocket automatically, then we should
    // not call `init` for HTTP fallback before it is ready.
    if (this.clientSocket.options.autoConnect) {
      this.connectWebSocket().catch(console.error)
    } else {
      this.connectEventSource().catch(console.error)
    }

    this.setupBrowserIdlenessCheck()

    this.registerKeepAlive()
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

  get isEventSourceEnabled() {
    return this.options?.eventSource && !this.clientSocket?.options?.autoConnect
  }

  async connectEventSource() {
    if (!this.isEventSourceEnabled) {
      return this.init()
    }

    try {
      if (
        this.clientHttp.isEventSourceConnected &&
        (await this.probeConnection())
      ) {
        return
      }

      this.clientHttp.createEventSource()

      await this.client.waitFor(ClientEvents.EVENTSOURCE_OPEN, 10000)
    } catch {
      console.log('event source open failed')
    } finally {
      await this.init()
    }
  }

  registerKeepAlive() {
    // If the server stops sending the keep alive event we should disconnect.
    this.client.on(HeleneEvents.KEEP_ALIVE, () => {
      clearTimeout(this.keepAliveTimeout)

      if (!this.clientSocket.ready) return

      this.keepAliveTimeout = setTimeout(
        async () => {
          await this.close()
          this.emit(HeleneEvents.KEEP_ALIVE_DISCONNECT)
        },
        // 2x the keep alive interval as a safety net.
        Client.KEEP_ALIVE_INTERVAL * 2,
      )

      return this.client.call(Methods.KEEP_ALIVE)
    })
  }

  startIdleTimeout() {
    if (!this.options.idlenessTimeout) return

    this.idleTimeout = setTimeout(() => {
      this.close()
        .then(() => {
          console.log('Helene: Disconnected due to inactivity')
        })
        .catch(console.error)
    }, this.options.idlenessTimeout)
  }

  stopIdleTimeout() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout)
    }
  }

  resetIdleTimer() {
    if (this.isEventSourceEnabled) {
      this.connectEventSource()
    } else {
      this.connectWebSocket().catch(console.error)
    }

    this.stopIdleTimeout()
    this.startIdleTimeout()
  }

  setupBrowserIdlenessCheck() {
    if (!this.options.idlenessTimeout) return

    const reset = throttle(
      this.resetIdleTimer.bind(this),
      this.options.idlenessTimeout / 2,
      {
        leading: true,
        trailing: false,
      },
    )

    // https://github.com/socketio/socket.io/issues/2924#issuecomment-297985409
    window.addEventListener('focus', reset)
    window.addEventListener('mousemove', reset)
    window.addEventListener('mousedown', reset)
    window.addEventListener('keydown', reset)
    window.addEventListener('scroll', reset)
    window.addEventListener('touchstart', reset)
    window.addEventListener('pageshow', reset)
    window.addEventListener('pagehide', reset)

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.resetIdleTimer()
      }
    })

    this.startIdleTimeout()
  }

  /**
   * Workaround for Safari not reconnecting after the app is brought back to the foreground.
   */
  async probeConnection() {
    console.log('probing connection')

    try {
      this.call(Methods.EVENT_PROBE).catch(console.error)
      await this.waitFor(HeleneEvents.EVENT_PROBE, Client.EVENT_PROBE_TIMEOUT)
      console.log('event probe success')
      return true
    } catch {
      console.log('event probe failed')
      this.emit(HeleneEvents.EVENT_PROBE_FAILED)
      await this.close()
      return false
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

  async connectWebSocket() {
    if (this.clientSocket.isOpen && (await this.probeConnection())) {
      return
    }

    await this.clientSocket.connect()

    return await this.isConnected()
  }

  async close() {
    clearTimeout(this.idleTimeout)

    this.clientHttp.close()

    this.timeouts.forEach(timeout => clearTimeout(timeout))

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
    return await this.close()
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

      this.clientSocket?.socket?.send(
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
    { timeout = 20000, ws, http, httpFallback = true }: CallOptions = {},
  ): Promise<any> {
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
      if (http || (!this.clientSocket?.ready && httpFallback)) {
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

  get connected() {
    return this.initialized && this.clientSocket?.ready
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

  /**
   * Creates a new collection and stores it into the `this.collections` map.
   * Useful for contextualizing collections to a specific client.
   */
  async createCollection(options: CollectionOptions) {
    const collection = await createCollection(options)
    this.collections.set(options.name, collection)
    return collection
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

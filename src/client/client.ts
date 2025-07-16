import type { CallOptions, MethodParams, ServerMethods } from '@helenejs/utils'
import {
  ClientEvents,
  Environment,
  Errors,
  HeleneEvents,
  Methods,
  NO_CHANNEL,
  PayloadType,
  Presentation,
  PromiseQueue,
  TOKEN_HEADER_KEY,
} from '@helenejs/utils'
import { EJSON } from 'ejson2'
import isEmpty from 'lodash/isEmpty'
import isFunction from 'lodash/isFunction'
import isObject from 'lodash/isObject'
import isPlainObject from 'lodash/isPlainObject'
import isString from 'lodash/isString'
import last from 'lodash/last'
import merge from 'lodash/merge'
import pick from 'lodash/pick'
import qs from 'query-string'
import { callMethodProxy } from './call-method-proxy'
import { ClientChannel } from './client-channel'
import { ClientHttp } from './client-http'
import { ClientSocket } from './client-socket'
import { IdleTimeout } from './idle-timeout'
import Timeout = NodeJS.Timeout

export type ErrorHandler = (error: Record<string, any>) => any

export type WebSocketOptions = {
  path?: string

  /**
   * Workaround for Safari not reconnecting after the app is brought back to the foreground.
   */
  disconnectOnPageHide?: boolean
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

export type ProxyMethodCall = { [key: string]: ProxyMethodCall } & (<
  T = any,
  R = any,
>(
  params?: MethodParams<T>,
  options?: CallOptions,
) => Promise<R>)

/**
 * When working with Next.js, it is probably a good idea to not run this in the
 * server side by using it inside a `useEffect` hook.
 */
export class Client<
  MethodsType extends ServerMethods = ServerMethods,
> extends ClientChannel {
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

  idleTimeout: IdleTimeout = null

  m: MethodsType

  static ENABLE_HEARTBEAT = true

  constructor(options: ClientOptions = {}) {
    super(NO_CHANNEL)

    this.m = callMethodProxy(this) as unknown as MethodsType

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

    this.idleTimeout = new IdleTimeout(this)
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
    return (
      (this.mode.eventsource && this.clientHttp.ready) ||
      (this.mode.websocket && this.clientSocket.ready) ||
      this.mode.http
    )
  }

  async connect() {
    if (this.mode.eventsource) {
      await this.clientHttp.createEventSource()
    }

    if (this.mode.websocket) {
      this.clientSocket.connect()
    }

    if (this.mode.http) {
      this.initialize().catch(console.error)
    }

    try {
      await this.waitFor(ClientEvents.INITIALIZED, 10000)
    } catch {
      console.error('Helene: Initialization timeout')
      console.trace()
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

    await this.initialize()
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

  #callInit(token: string, context: Record<string, any> = {}) {
    return this.call(
      Methods.RPC_INIT,
      {
        token,
        meta: this.options.meta,
        ...context,
      },
      {
        httpFallback: [TransportMode.HttpSSE, TransportMode.HttpOnly].includes(
          this.options.mode,
        ),
      },
    )
  }

  /**
   * Initializes the client. It should be called before any other method.
   *
   * It should be called whenever a transport is connected, either on reconnection or from calling `connect`.
   */
  async initialize() {
    if (this.initializing) {
      console.log('Helene: Already initializing')
      await this.waitFor(ClientEvents.INITIALIZED)
      return
    }

    this.initializing = true

    this.initialized = false

    this.loadContext()

    this.emit(ClientEvents.INITIALIZING)

    const { token } = this.context ?? {}

    if (token && !isString(token)) throw new Error(Errors.INVALID_TOKEN)

    const context = this.options.allowedContextKeys.length
      ? pick(this.context ?? {}, this.options.allowedContextKeys)
      : {}

    let result = await this.#callInit(token, context)

    if (token && !result) {
      console.log('Helene: Initialization failed, trying again')
      result = await this.#callInit(token, context)
    }

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

    return true
  }

  /**
   * The login method is always called via http so a http-only cookie can be set if the user so prefers.
   */
  async login(params: WebSocketRequestParams, opts?: CallOptions) {
    const response = await this.call(Methods.RPC_LOGIN, params, {
      ...opts,
      http: true,
    })

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
  void<T = any>(
    method: string,
    params?: MethodParams<T>,
    { http, httpFallback = true }: CallOptions = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const uuid = Presentation.uuid()

      const payload = {
        type: PayloadType.METHOD,
        uuid,
        method,
        params,
        void: true,
      }

      this.emit(ClientEvents.OUTBOUND_MESSAGE, payload)

      if (http || (!this.clientSocket.ready && httpFallback)) {
        return this.clientHttp.request(payload, null, reject)
      }

      this.clientSocket.send(Presentation.encode(payload))

      resolve()
    })
  }

  async call<P = Record<string, any>, R = any>(
    method: string,
    params?: P,
    options?: CallOptions,
  ): Promise<R> {
    const {
      timeout = 20000,
      http,
      httpFallback = true,
      ignoreInit = false,
      maxRetries = 0,
      delayBetweenRetriesMs = 3000,
    } = options ?? {}

    // It should wait for the client to initialize before calling any method.
    if (!ignoreInit && !this.initialized && method !== Methods.RPC_INIT) {
      try {
        console.log('Helene: Waiting for initialization')
        await this.waitFor(ClientEvents.INITIALIZED, Math.floor(timeout / 2))
      } catch {
        throw new Error('Helene: Client not initialized')
      }
    }

    let lastError: any

    for (let attempt = 0; attempt < 1 + maxRetries; attempt++) {
      try {
        return await new Promise((resolve, reject) => {
          const uuid = Presentation.uuid()
          const payload = { uuid, type: PayloadType.METHOD, method, params }
          this.emit(ClientEvents.OUTBOUND_MESSAGE, payload)

          if (http || (!this.clientSocket.ready && httpFallback)) {
            return this.clientHttp.request(payload, resolve, reject)
          }

          this.clientSocket.send(Presentation.encode(payload))

          const timeoutId = setTimeout(() => {
            const promise = this.queue.dequeue(uuid)
            promise.reject(new Error('Result Timeout'))
          }, timeout)

          this.timeouts.add(timeoutId)

          this.queue.enqueue(uuid, {
            method: method as string,
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
      } catch (error) {
        lastError = error

        if (attempt > 0) {
          console.log(
            `Attempt ${attempt + 1} failed with error: ${error.message}`,
          )
        }

        if (attempt + 1 >= maxRetries) {
          throw lastError
        }

        await new Promise(resolve => setTimeout(resolve, delayBetweenRetriesMs))
      }
    }
  }

  typed<T extends ServerMethods>(types: T) {
    return this as any as Client<T>
  }

  combine<T extends Client>(methods: T) {
    return this as any as Client<InferClientMethods<T> & MethodsType>
  }

  handleError(payload: Presentation.Payload) {
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

  handleEvent(payload: Presentation.Payload) {
    this.debugger('Event Received', payload)
    return this.channel(payload.channel).emit(payload.event, payload.params)
  }

  handleResult(payload: Presentation.Payload) {
    const promise = this.queue.dequeue(payload.uuid)

    if (!promise) return

    clearTimeout(promise.timeoutId)
    this.timeouts.delete(promise.timeoutId)

    promise.resolve(payload.result)
  }

  payloadRouter(payload: Presentation.Payload) {
    this.emit(ClientEvents.INBOUND_MESSAGE, payload)

    switch (payload.type) {
      case PayloadType.ERROR:
        return this.handleError(payload)
      case PayloadType.EVENT:
        return this.handleEvent(payload)
      case PayloadType.RESULT:
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

    console.log('DevTools Attached')

    this.on(ClientEvents.OUTBOUND_MESSAGE, content => {
      // @ts-ignore
      window.__helene_devtools_log_message?.({
        id: generateId(),
        content: EJSON.stringify(content),
        isOutbound: true,
        timestamp: Date.now(),
      })
    })

    this.on(ClientEvents.INBOUND_MESSAGE, content => {
      // @ts-ignore
      window.__helene_devtools_log_message?.({
        id: generateId(),
        content: EJSON.stringify(content),
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

export type InferClientMethods<T extends Client> = T['m']

import WebSocket from 'ws'
import { v4 as uuid } from 'uuid'
import { RedisClientOptions } from 'redis'
import { HttpTransport } from './transports/http-transport'
import { WebSocketTransport } from './transports/websocket-transport'
import { Method, MethodFunction, MethodOptions, MethodParams } from './method'
import { ClientNode } from './client-node'
import { RedisTransport } from './transports/redis-transport'
import {
  ClientEvents,
  HeleneEvents,
  NO_CHANNEL,
  ServerEvents,
} from '../constants'
import { RequestListener } from 'http'
import * as assert from 'assert'
import { isFunction, isObject, isString } from 'lodash'
import { Methods } from './methods'
import { Environment } from '../utils/environment'
import { ServerChannel } from './server-channel'
import { DefaultMethods } from './default-methods'
import { EventOptions } from './event'
import { combineLatest, fromEvent } from 'rxjs'

declare global {
  // eslint-disable-next-line no-var
  var Helene: Server
}

export type AuthFunction = (this: ClientNode, context: any) => any

export type RateLimit =
  | boolean
  | {
      max: number
      interval: number
    }

export type ServerOptions = {
  host?: string
  port?: number
  auth?: AuthFunction
  origins?: string[]
  debug?: boolean
  ws?: WebSocket.ServerOptions
  redis?: RedisClientOptions
  requestListener?: RequestListener
  globalInstance?: boolean
  allowedContextKeys?: string[]
  useRedis?: boolean
  rateLimit?: RateLimit
}

export class Server extends ServerChannel {
  uuid: string
  httpTransport: HttpTransport
  webSocketTransport: WebSocketTransport
  redisTransport: RedisTransport
  host = 'localhost'
  port: number
  requestListener: RequestListener
  allowedContextKeys: string[]
  isAuthEnabled = false
  auth: AuthFunction
  debug = false
  rateLimit: RateLimit

  methods: Map<string, Method> = new Map()
  clients: Map<string, ClientNode> = new Map()
  channels: Map<string, ServerChannel> = new Map()
  eventBlueprints: Map<string, EventOptions> = new Map()

  ready = false

  static ERROR_EVENT = 'error'

  constructor({
    host = 'localhost',
    port = 80,
    debug = false,
    origins,
    ws,
    redis,
    requestListener,
    globalInstance = true,
    allowedContextKeys = [],
    useRedis = false,
    rateLimit = false,
  }: ServerOptions = {}) {
    super(NO_CHANNEL)

    this.setServer(this)
    this.createDefaultMethods()

    if (globalInstance) {
      if (global.Helene)
        throw new Error('There can only be one instance of Helene.')

      global.Helene = this
    }

    assert.ok(host, 'Invalid Host')
    assert.ok(port, 'Invalid Port')

    this.host = host
    this.port = port
    this.requestListener = requestListener
    this.debug = debug

    this.uuid = uuid()

    this.rateLimit = rateLimit

    this.allowedContextKeys = allowedContextKeys

    this.httpTransport = new HttpTransport(this, origins, this.rateLimit)

    this.webSocketTransport = new WebSocketTransport(this, {
      host: this.host,
      ...ws,
    })

    this.redisTransport = useRedis
      ? new RedisTransport(this, {
          url: `redis://${this.host}:6379`,
          ...redis,
        })
      : null

    if (Environment.isDevelopment) {
      this.instrumentDebugger()
    }

    this.addEvent(HeleneEvents.METHOD_REFRESH)

    this.channels.set(NO_CHANNEL, this)

    const serverEvents = []

    serverEvents.push(fromEvent(this, ServerEvents.LISTENING))

    if (this.redisTransport) {
      serverEvents.push(fromEvent(this, ServerEvents.REDIS_CONNECT))
    }

    combineLatest(serverEvents).subscribe(() => {
      this.ready = true
      this.emit(ServerEvents.READY, true)
    })
  }

  isReady() {
    return new Promise(resolve => {
      if (this.ready) resolve(true)

      this.once(ServerEvents.READY, resolve)
    })
  }

  get express() {
    return this.httpTransport.express
  }

  setAuth({ auth, logIn }: { auth: AuthFunction; logIn: MethodFunction }) {
    this.isAuthEnabled = true
    this.auth = auth
    this.addMethod(Methods.RPC_LOGIN, logIn)
  }

  async close() {
    this.clients.forEach(node => node.close())
    this.clients.clear()
    this.methods.clear()
    this.channels.clear()

    await this.redisTransport?.close()
    await this.webSocketTransport?.close()
    await this.httpTransport?.close()

    delete global.Helene

    this.debugger('Helene: Server Stopped')

    return true
  }

  static(path: string, catchAll: boolean) {
    return this.httpTransport.static(path, catchAll)
  }

  debugger(...args) {
    if (Environment.isDevelopment) this.emit(ClientEvents.DEBUGGER, args)
  }

  async call(method: string, params?: MethodParams): Promise<any> {
    this.debugger(`[server] Calling ${method}`, params)

    const methodInstance = this.methods.get(method)

    const node = new ClientNode(this)

    node.isServer = true

    return await methodInstance.exec(params, node)
  }

  instrumentDebugger() {
    this.addEvent(ClientEvents.DEBUGGER)
  }

  createDefaultMethods() {
    Object.entries(DefaultMethods).forEach(([key, value]) =>
      this.methods.set(key, value(this)),
    )
  }

  getMethod(method: string) {
    return this.methods.get(method)
  }

  addClient(node: ClientNode) {
    this.clients.set(node._id, node)
  }

  deleteClient(node: ClientNode) {
    this.clients.delete(node._id)
    this.channels.forEach(channel => channel.deleteClientNode(node))
  }

  addMethod(method: string, fn: MethodFunction, opts?: MethodOptions) {
    this.methods.set(method, new Method(fn, opts))
  }

  channel(name: string | object = NO_CHANNEL) {
    if (
      isObject(name) &&
      name.constructor.name === 'ObjectId' &&
      isFunction(name.toString)
    ) {
      name = name.toString()
    }

    if (!name || !isString(name)) return this
    if (name === NO_CHANNEL) return this

    if (this.channels.has(name)) return this.channels.get(name)
    const channel = new ServerChannel(name)
    channel.setServer(this.server)
    this.channels.set(name, channel)
    return channel
  }

  addEventToAllChannels(name: string, opts?: EventOptions) {
    this.channels.forEach(channel => channel.addEvent(name, opts, false))
  }
}

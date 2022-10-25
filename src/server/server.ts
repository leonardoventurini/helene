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
  Methods,
  NO_CHANNEL,
  ServerEvents,
} from '../constants'
import { RequestListener } from 'http'
import * as assert from 'assert'
import { isFunction, isObject, isString } from 'lodash'
import { Environment } from '../utils/environment'
import { ServerChannel } from './server-channel'
import { DefaultMethods } from './default-methods'
import { Event } from './event'
import { combineLatest, fromEvent } from 'rxjs'

declare global {
  // eslint-disable-next-line no-var
  var Helene: Server
}

export type ChannelChecker = (node: ClientNode, channel: string) => boolean

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
  redis?: RedisClientOptions | boolean
  requestListener?: RequestListener
  globalInstance?: boolean
  allowedContextKeys?: string[]
  rateLimit?: RateLimit
  shouldAllowChannelSubscribe?: ChannelChecker
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
  allClients: Map<string, ClientNode> = new Map()
  channels: Map<string, ServerChannel> = new Map()
  events: Map<string, Event> = new Map()

  ready = false

  shouldAllowChannelSubscribe: ChannelChecker

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

    this.redisTransport = redis ? new RedisTransport(this, redis) : null

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

  setChannelAuthorization(checker: ChannelChecker) {
    this.shouldAllowChannelSubscribe = checker
  }

  async close() {
    this.allClients.forEach(node => node.close())
    this.allClients.clear()
    this.methods.clear()
    this.channels.forEach(channel => channel.clear())
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
    this.allClients.set(node._id, node)
  }

  deleteClient(node: ClientNode) {
    this.allClients.delete(node._id)
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

  async getOnlineStats() {
    if (this.redisTransport) {
      return await this.redisTransport.getStats()
    }

    const users = new Set()

    this.allClients.forEach(client => {
      if (client.userId) {
        let userId = client.userId

        if (isObject(userId) && userId.constructor.name === 'ObjectId') {
          userId = userId.toString()
        }

        users.add(userId)
      }
    })

    return {
      clientCount: this.allClients.size,
      userCount: users.size,
      users: Array.from(users),
    }
  }
}

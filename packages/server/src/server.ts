import {
  HeleneEvents,
  Methods,
  NO_CHANNEL,
  Presentation,
  ServerEvents,
  waitForAll,
} from '@helenejs/utils'
import * as assert from 'assert'
import { RequestListener } from 'http'
import defer from 'lodash/defer'
import isFunction from 'lodash/isFunction'
import isObject from 'lodash/isObject'
import isString from 'lodash/isString'
import { RedisClientOptions } from 'redis'
import WebSocket from 'ws'
import { z } from 'zod'
import { ClientNode } from './client-node'
import { createMethodProxy } from './create-method-proxy'
import { DefaultMethods } from './default-methods'
import { Event } from './event'
import { Method, MethodFunction, MethodOptions, MethodParams } from './method'
import { ServerChannel } from './server-channel'
import { HttpTransport, RedisTransport, WebSocketTransport } from './transports'

declare global {
  // eslint-disable-next-line no-var
  var Helene: Server
}

export type ChannelChecker = (
  node: ClientNode,
  channel: string,
) => Promise<boolean>

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
  ws?: Partial<WebSocket.ServerOptions>
  redis?: RedisClientOptions | boolean
  requestListener?: RequestListener
  globalInstance?: boolean
  allowedContextKeys?: string[]
  rateLimit?: RateLimit
  shouldAllowChannelSubscribe?: ChannelChecker
}

export type ProxyMethodCreation = {
  [key: string]: ProxyMethodCreation
} & any

export type ServerMethodDefinition<
  Schema extends z.ZodTypeAny | z.ZodUndefined = z.ZodUndefined,
  Result = any,
> = {
  schema?: Schema
  fn: (
    schema: Schema extends z.ZodUndefined ? void : z.input<Schema>,
  ) => Promise<Result>
}

export type ServerMethods = {
  [key: string]: ServerMethodDefinition
}

export class Server<
  M extends ServerMethods = ServerMethods,
> extends ServerChannel {
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

  methods: Map<string, Method<any, any>> = new Map()
  allClients: Map<string, ClientNode> = new Map()
  channels: Map<string, ServerChannel> = new Map()
  events: Map<string, Event> = new Map()

  m: ProxyMethodCreation

  acceptConnections = true

  ready = false

  shouldAllowChannelSubscribe: ChannelChecker = async () => true

  static ERROR_EVENT = 'error'

  public handlers: M = {} as M

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

    this.m = createMethodProxy(this)

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
    this.port = Number(port)
    this.requestListener = requestListener
    this.debug = debug

    this.uuid = Presentation.uuid()

    this.rateLimit = rateLimit

    this.allowedContextKeys = allowedContextKeys

    this.httpTransport = new HttpTransport(this, origins, this.rateLimit)

    this.webSocketTransport = new WebSocketTransport(this, origins, ws)

    this.httpTransport.http.listen(this.port, this.host, () => {
      defer(() => {
        this.server.emit(ServerEvents.HTTP_LISTENING)
      })
    })

    this.redisTransport = redis ? new RedisTransport(this, redis) : null

    this.addEvent(HeleneEvents.METHOD_REFRESH)

    this.channels.set(NO_CHANNEL, this)

    waitForAll(
      this,
      [
        ServerEvents.HTTP_LISTENING,
        this.redisTransport ? ServerEvents.REDIS_CONNECT : null,
      ].filter(Boolean),
    ).then(() => {
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

    this.emit(ServerEvents.CLOSED)

    return true
  }

  static(path: string, catchAll: boolean) {
    return this.httpTransport.static(path, catchAll)
  }

  debugger(...args) {
    if (this.debug) console.debug(...args)
  }

  async call<T = any>(method: string, params?: MethodParams<T>): Promise<any> {
    this.debugger(`[server] Calling ${method}`, params)

    const methodInstance = this.methods.get(method)

    const node = new ClientNode(this)

    node.isServer = true

    return await methodInstance.exec(params, node)
  }

  createDefaultMethods() {
    Object.entries(DefaultMethods).forEach(([key, value]) =>
      this.methods.set(key, value(this, key)),
    )
  }

  getMethod(method: string) {
    return this.methods.get(method)
  }

  addClient(node: ClientNode) {
    this.allClients.set(node.uuid, node)
  }

  deleteClient(node: ClientNode) {
    this.allClients.delete(node.uuid)
    this.channels.forEach(channel => {
      channel.deleteClientNode(node)

      if (channel.clients.size === 0) {
        this.channels.delete(channel.channelName)
      }
    })
  }

  addMethod<
    K extends string,
    Schema extends z.ZodTypeAny | z.ZodUndefined = z.ZodUndefined,
    Params extends any[] = any[],
    Result = any,
  >(
    method: K,
    fn: Schema extends z.ZodUndefined
      ? (...args: Params) => Promise<Result> | Result
      : (schema: z.input<Schema>) => Promise<Result> | Result,
    opts?: MethodOptions<Schema>,
  ): Server<M & Record<K, ServerMethodDefinition<Schema, Result>>> {
    ;(this.handlers as any)[method] = {
      fn: fn as Schema extends z.ZodUndefined
        ? (...args: Params) => Promise<Result>
        : (schema: z.input<Schema>) => Promise<Result>,
      schema: opts?.schema,
    }

    this.methods.set(
      method,
      new Method<Schema, Result>(
        this,
        method,
        fn as MethodFunction<any, Result>,
        opts,
      ),
    )

    return this as any
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
}

export type InferServerMethods<T extends Server<any>> = T['handlers']

export function createServer(options?: ServerOptions) {
  return new Server(options)
}

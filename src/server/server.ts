import WebSocket from 'ws'
import { v4 as uuid } from 'uuid'
import { RedisClientOptions } from 'redis'
import { Namespace } from './namespace'
import { HttpTransport } from './transports/http-transport'
import { WebSocketTransport } from './transports/websocket-transport'
import { MethodFunction, MethodOptions } from './method'
import { ClientNode } from './client-node'
import { RedisTransport } from './transports/redis-transport'
import { assert } from 'chai'
import { Methods } from './default-methods'
import { DEFAULT_NAMESPACE } from '../constants'
import { RequestListener } from 'http'

declare global {
  var Helene: Server

  namespace NodeJS {
    interface Global {
      Helene: Server
    }
  }
}

export type AuthFunction = (this: ClientNode, context: any) => any

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
}

export class Server extends Namespace {
  uuid: string
  auth: AuthFunction
  httpTransport: HttpTransport
  webSocketTransport: WebSocketTransport
  redisTransport: RedisTransport
  namespaces: Map<string, Namespace> = new Map()
  host = 'localhost'
  port: number
  requestListener: RequestListener
  allowedContextKeys: string[]

  debug = false

  static defaultNamespace = '/'

  static ERROR_EVENT = 'error'

  constructor({
    host = 'localhost',
    port = 80,
    debug = false,
    auth,
    origins,
    ws,
    redis,
    requestListener,
    globalInstance = true,
    allowedContextKeys = [],
    useRedis = false,
  }: ServerOptions = {}) {
    super(DEFAULT_NAMESPACE)

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
    this.auth = auth

    this.allowedContextKeys = allowedContextKeys

    this.httpTransport = new HttpTransport(this, origins)

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

    this.namespaces.set(DEFAULT_NAMESPACE, this)
  }

  get express() {
    return this.httpTransport.express
  }

  addNamespace(ns: string) {
    const namespace = new Namespace(ns)
    namespace.setServer(this)
    namespace.createDefaultMethods()
    this.namespaces.set(ns, namespace)
    return namespace
  }

  getNamespace(ns: string = DEFAULT_NAMESPACE, create?: true) {
    assert.isString(ns)

    let namespace = this.namespaces.get(ns)

    if (!namespace && create) namespace = this.addNamespace(ns)

    return namespace
  }

  removeNamespace(ns: string) {
    assert.isString(ns)

    this.namespaces.get(ns).close()
  }

  setLogIn(fn: MethodFunction, opts?: MethodOptions) {
    this.register(Methods.RPC_LOGIN, fn, opts)
  }

  of(namespace: string = DEFAULT_NAMESPACE) {
    return this.getNamespace(namespace, true)
  }

  async close() {
    await this.redisTransport?.close()
    await this.webSocketTransport?.close()
    await this.httpTransport?.close()

    delete global.Helene

    this.debugger('Helene: Server Stopped')

    return true
  }

  debugger(...args) {
    if (this.debug) console.warn(...args)
  }
}

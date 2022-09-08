import WebSocket from 'ws'
import { v4 as uuid } from 'uuid'
import { RedisClientOptions } from 'redis'
import { Namespace } from './namespace'
import { HttpTransport } from './transports/http-transport'
import { WebSocketTransport } from './transports/websocket-transport'
import { MethodFunction, MethodParams } from './method'
import { ClientNode } from './client-node'
import { RedisTransport } from './transports/redis-transport'
import { ClientEvents, DEFAULT_NAMESPACE } from '../constants'
import { RequestListener } from 'http'
import * as assert from 'assert'
import { isString } from 'lodash'
import { check } from '../utils/check'
import { Methods } from './methods'
import { Client } from '../client/client'
import { Environment } from '../utils/environment'

declare global {
  // eslint-disable-next-line no-var
  var Helene: Server | Client

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
  httpTransport: HttpTransport
  webSocketTransport: WebSocketTransport
  redisTransport: RedisTransport
  namespaces: Map<string, Namespace> = new Map()
  host = 'localhost'
  port: number
  requestListener: RequestListener
  allowedContextKeys: string[]

  isAuthEnabled = false
  auth: AuthFunction

  debug = false

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

    if (Environment.isDevelopment) {
      this.instrumentDebugger()
    }
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
    assert.ok(isString(ns))

    let namespace = this.namespaces.get(ns)

    if (!namespace && create) namespace = this.addNamespace(ns)

    return namespace
  }

  removeNamespace(namespace: string) {
    check('namespace', namespace, String)

    this.namespaces.get(namespace).close()
  }

  setAuth({ auth, logIn }: { auth: AuthFunction; logIn: MethodFunction }) {
    this.isAuthEnabled = true
    this.auth = auth
    this.register(Methods.RPC_LOGIN, logIn)
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

  static(path: string, catchAll: boolean) {
    return this.httpTransport.static(path, catchAll)
  }

  debugger(...args) {
    if (Environment.isDevelopment) this.emit(ClientEvents.DEBUGGER, args)
  }

  async call(method: string, params?: MethodParams): Promise<any> {
    this.debugger(`[server] Calling ${method}`, params)

    const methodInstance = this.methods.get(method)

    const node = new ClientNode()

    node.isServer = true

    return await methodInstance.exec(params, node)
  }

  instrumentDebugger() {
    this.events.add(ClientEvents.DEBUGGER)
  }
}

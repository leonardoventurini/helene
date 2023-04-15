import WebSocket from 'ws'
import { WebSocketMessageOptions } from './transports'
import http from 'http'
import url from 'url'
import { isString } from 'lodash'
import { Presentation } from '../utils/presentation'
import { Request, Response } from 'express'
import { HeleneAsyncLocalStorage } from './helene-async-local-storage'
import { RateLimiter } from 'limiter'
import { RateLimit, Server } from './server'
import { ObjectId } from 'bson'
import { EventEmitter2 } from 'eventemitter2'
import { ServerEvents } from '../utils'

export type ClientNodeContext = Record<string, any>

export class ClientNode extends EventEmitter2 {
  _id: string
  isAuthenticated = false
  meta: Record<string, any> = {}
  context: ClientNodeContext = {}
  userId: ObjectId | string | null = null
  socket?: WebSocket = {} as WebSocket
  req?: Request = {} as Request
  res?: Response = {} as Response
  isServer = false
  limiter: RateLimiter
  server: Server
  headers: Record<string, string> = {}
  remoteAddress: string | string[]
  userAgent: string

  constructor(
    server: Server,
    socket?: WebSocket,
    req?: Request,
    res?: Response,
    limit?: RateLimit,
  ) {
    super()

    this.server = server
    this.socket = socket
    this.req = req
    this.res = res

    if (limit) {
      this.limiter = new RateLimiter(
        limit === true
          ? {
              tokensPerInterval: 60,
              interval: 60 * 1000,
            }
          : {
              tokensPerInterval: limit.max,
              interval: limit.interval,
            },
      )
    }
  }

  get storage() {
    return HeleneAsyncLocalStorage.getStore()
  }

  get authenticated() {
    return this.isAuthenticated
  }

  set authenticated(authenticated: boolean) {
    this.isAuthenticated = authenticated
  }

  get readyState() {
    return this.socket?.readyState
  }

  setId(request: http.IncomingMessage) {
    const { query } = url.parse(request.url, true)

    this._id = (query?.uuid as string) ?? Presentation.uuid()
  }

  setContext(context: ClientNodeContext) {
    this.context = this.authenticated ? context : {}
  }

  send(payload: Presentation.Payload | string, opts?: WebSocketMessageOptions) {
    this.socket?.send(
      isString(payload) ? payload : Presentation.encode(payload),
      opts,
    )
  }

  result(
    payload: Presentation.MethodResultPayloadPartial,
    opts?: WebSocketMessageOptions,
  ) {
    this.socket?.send(Presentation.Outbound.result(payload), opts)
  }

  /**
   * @warning There is an `event` property already in the super class.
   */
  sendEvent(event: string, params?: any, opts?: WebSocketMessageOptions) {
    return this.send(
      {
        uuid: Presentation.uuid(),
        type: Presentation.PayloadType.EVENT,
        event,
        params,
      },
      opts,
    )
  }

  error(
    payload: Presentation.ErrorPayloadPartial,
    opts?: WebSocketMessageOptions,
  ) {
    this.socket?.send(Presentation.Outbound.error(payload), opts)
  }

  close() {
    this.server.emit(ServerEvents.DISCONNECTION, this)
    this.socket.terminate()
  }
}

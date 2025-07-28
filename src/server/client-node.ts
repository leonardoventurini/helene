import { HeleneEvents, PayloadType, Presentation, ServerEvents } from '../utils'
import { EventEmitter2 } from 'eventemitter2'
import { Request, Response } from 'express'
import http from 'http'
import { RateLimiter } from 'limiter'
import isString from 'lodash/isString'
import { Socket } from 'socket.io'
import { Heartbeat } from './heartbeat'
import { RateLimit, Server } from './server'

export type ClientNodeContext = Record<string, any>

export class ClientNode extends EventEmitter2 {
  uuid: string
  isAuthenticated = false
  meta: Record<string, any> = {}
  context: ClientNodeContext = {}
  userId: any = null
  user: Record<string, any> = null
  socket?: Socket
  req?: Request = {} as Request
  res?: Response = {} as Response
  isServer = false
  limiter: RateLimiter
  server: Server
  headers: Record<string, string> = {}
  remoteAddress: string | string[]
  userAgent: string
  heartbeat: Heartbeat

  constructor(
    server: Server,
    socket?: Socket,
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

    if (socket) {
      this.heartbeat = new Heartbeat({
        sendPing: () => {
          this.send({ type: PayloadType.HEARTBEAT })
        },
        onTimeout: () => {
          this.emit(HeleneEvents.HEARTBEAT_DISCONNECT)
          this.socket.disconnect()
        },
      })

      this.heartbeat.start()
    }
  }

  get authenticated() {
    return this.isAuthenticated
  }

  set authenticated(authenticated: boolean) {
    this.isAuthenticated = authenticated
  }

  get readyState() {
    return this.socket?.conn.readyState
  }

  setId(uuid: string) {
    this.uuid = uuid
  }

  setContext(context: ClientNodeContext) {
    this.context = this.authenticated ? context : {}

    this.setUserId()
  }

  setTrackingProperties(socket: Socket | http.IncomingMessage) {
    if (socket instanceof http.IncomingMessage) {
      this.headers = socket.headers as any
      this.userAgent = socket.headers['user-agent']
      this.remoteAddress =
        socket.headers['x-forwarded-for'] || socket.socket.remoteAddress
    } else {
      this.headers = socket.conn.request.headers as any
      this.userAgent = socket.conn.request.headers['user-agent']
      this.remoteAddress =
        socket.conn.request.headers['x-forwarded-for'] ||
        socket.conn.remoteAddress
    }
  }

  // The user ID is used for authorizing the user's channel.
  setUserId() {
    if (!this.authenticated) return

    const userId = this.context?.user?._id

    if (!userId) {
      throw new Error(
        'The auth function must return a user object with a valid "_id" property',
      )
    }

    this.userId = this.context.user._id
    this.user = this.context.user
  }

  send(payload: Record<string, any> | string) {
    if (!this.socket) {
      throw new Error(':write_no_socket')
    }

    this.socket?.write(
      isString(payload) ? payload : Presentation.encode(payload),
    )
  }

  result(payload: Record<string, any>) {
    this.socket.write(
      Presentation.encode({
        type: PayloadType.RESULT,
        ...payload,
      }),
    )
  }

  /**
   * @warning There is an `event` property already in the super class.
   */
  sendEvent(event: string, params?: any) {
    return this.send({
      uuid: Presentation.uuid(),
      type: PayloadType.EVENT,
      event,
      params,
    })
  }

  error(payload: Record<string, any>) {
    this.socket?.write(
      Presentation.encode({
        type: PayloadType.ERROR,
        ...payload,
      }),
    )
  }

  close() {
    this.socket?.disconnect()

    this.emit(ServerEvents.DISCONNECT)
    this.server.emit(ServerEvents.DISCONNECTION, this)

    this.heartbeat?.stop()
  }
}

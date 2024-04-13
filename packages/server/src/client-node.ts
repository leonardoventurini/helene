import isString from 'lodash/isString'
import { HeleneEvents, Presentation, ServerEvents } from '@helenejs/utils'
import { Request, Response } from 'express'
import { RateLimiter } from 'limiter'
import { RateLimit, Server } from './server'
import { EventEmitter2 } from 'eventemitter2'
import http from 'http'
import io from 'socket.io'
import defer from 'lodash/defer'

export type ClientNodeContext = Record<string, any>

export class ClientNode extends EventEmitter2 {
  uuid: string
  isAuthenticated = false
  meta: Record<string, any> = {}
  context: ClientNodeContext = {}
  userId: any = null
  user: Record<string, any> = null
  socket?: io.Socket
  isEventSource = false
  req?: Request = {} as Request
  res?: Response = {} as Response
  isServer = false
  limiter: RateLimiter
  server: Server
  headers: Record<string, string> = {}
  remoteAddress: string | string[]
  userAgent: string
  terminationTimeout: NodeJS.Timeout
  eventSourceDataId = 0
  keepAliveInterval: NodeJS.Timeout

  static KEEP_ALIVE_INTERVAL = 10000
  static ENABLE_KEEP_ALIVE = true

  constructor(
    server: Server,
    socket?: io.Socket,
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
      this.keepAliveInterval = setInterval(() => {
        if (ClientNode.ENABLE_KEEP_ALIVE && socket.connected) {
          this.sendEvent(HeleneEvents.KEEP_ALIVE)

          this.terminationTimeout = setTimeout(() => {
            clearInterval(this.keepAliveInterval)

            if (socket.connected) {
              socket?.disconnect(true)
              this.emit(HeleneEvents.KEEP_ALIVE_DISCONNECT)
            }
          }, ClientNode.KEEP_ALIVE_INTERVAL / 2)
        }
      }, ClientNode.KEEP_ALIVE_INTERVAL)
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

  setTrackingProperties(socket: io.Socket | http.IncomingMessage) {
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

  writeEventSource(res: Response, payload: string | Record<string, any>) {
    res?.write(
      `id: ${++this.eventSourceDataId}\ndata: ${(isString(payload)
        ? payload
        : Presentation.encode(payload)
      )
        // eslint-disable-next-line no-control-regex
        .replace(/[\r\n\x00]/g, '\ndata: ')}\n\n`,
    )
  }

  send(payload: Presentation.Payload | string) {
    if (!this.socket) {
      const clientNode = this.server.httpTransport.eventSourceClients.get(
        this.uuid,
      )
      this.writeEventSource(clientNode?.res, payload)
      return
    }

    this.socket?.write(
      isString(payload) ? payload : Presentation.encode(payload),
    )
  }

  result(payload: Presentation.MethodResultPayloadPartial) {
    this.socket.write(Presentation.Outbound.result(payload))
  }

  /**
   * @warning There is an `event` property already in the super class.
   */
  sendEvent(event: string, params?: any) {
    return this.send({
      uuid: Presentation.uuid(),
      type: Presentation.PayloadType.EVENT,
      event,
      params,
    })
  }

  error(payload: Presentation.ErrorPayloadPartial) {
    this.socket?.write(Presentation.Outbound.error(payload))
  }

  close() {
    if (this.isEventSource) {
      // If we don't destroy the request, we have to force to terminate the HTTP server,
      // and it takes a ton of idle time to do so.
      this.res.write('event: close\ndata: Server-side termination\n\n')

      defer(() => {
        this.res?.end()
        this.req?.destroy()
        this.server.httpTransport.eventSourceClients.delete(this.uuid)
      })
    }

    this.socket?.disconnect()

    this.emit(ServerEvents.DISCONNECT)
    this.server.emit(ServerEvents.DISCONNECTION, this)
  }
}

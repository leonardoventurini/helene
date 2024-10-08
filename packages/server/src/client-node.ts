import isString from 'lodash/isString'
import {
  HeleneEvents,
  PayloadType,
  Presentation,
  ServerEvents,
} from '@helenejs/utils'
import { Request, Response } from 'express'
import { RateLimiter } from 'limiter'
import { RateLimit, Server } from './server'
import { EventEmitter2 } from 'eventemitter2'
import sockjs from 'sockjs'
import http from 'http'
import defer from 'lodash/defer'
import { Heartbeat } from './heartbeat'

export type ClientNodeContext = Record<string, any>

export class ClientNode extends EventEmitter2 {
  uuid: string
  isAuthenticated = false
  meta: Record<string, any> = {}
  context: ClientNodeContext = {}
  userId: any = null
  user: Record<string, any> = null
  socket?: sockjs.Connection
  isEventSource = false
  req?: Request = {} as Request
  res?: Response = {} as Response
  isServer = false
  limiter: RateLimiter
  server: Server
  headers: Record<string, string> = {}
  remoteAddress: string | string[]
  userAgent: string
  eventSourceDataId = 0
  heartbeat: Heartbeat

  constructor(
    server: Server,
    socket?: sockjs.Connection,
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
          this.socket.close()
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
    return this.socket?.readyState
  }

  setId(uuid: string) {
    this.uuid = uuid
  }

  setContext(context: ClientNodeContext) {
    this.context = this.authenticated ? context : {}

    this.setUserId()
  }

  setTrackingProperties(conn: sockjs.Connection | http.IncomingMessage) {
    if (conn instanceof http.IncomingMessage) {
      this.remoteAddress =
        conn.headers['x-forwarded-for'] || conn.socket.remoteAddress
    } else {
      this.remoteAddress = conn.headers['x-forwarded-for'] || conn.remoteAddress
    }

    this.headers = conn.headers as any
    this.userAgent = conn.headers['user-agent']
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

  send(payload: Record<string, any> | string) {
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
    this.socket?.close()

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

    this.socket?.close()

    this.emit(ServerEvents.DISCONNECT)
    this.server.emit(ServerEvents.DISCONNECTION, this)

    this.heartbeat?.stop()
  }
}

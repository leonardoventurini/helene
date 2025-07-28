import {
  CLIENT_ID_HEADER_KEY,
  Errors,
  PayloadType,
  Presentation,
  PublicError,
  SchemaValidationError,
  ServerEvents,
  TOKEN_HEADER_KEY,
} from '../../utils'
import cors from 'cors'
import express from 'express'
import http from 'http'
import { ClientNode } from '../client-node'
import { RateLimit, Server } from '../server'

import { EJSON } from 'ejson2'
import rateLimit from 'express-rate-limit'
import isString from 'lodash/isString'

declare module 'express' {
  interface Request {
    context?: Record<string, any>
  }
}

export enum HttpTransportEvents {
  HTTP_LISTENING = 'http:listening',
  HTTP_SERVER_ERROR = 'http:server:error',
  HTTP_SERVER_CLOSED = 'http:server:closed',
}

export type RequestTransport = {
  context: any
  payload?: Record<string, any>
}

export class HttpTransport {
  server: Server
  http: http.Server
  express: express.Express

  constructor(server: Server, origins: string[], limit: RateLimit) {
    this.server = server
    this.express = express()
    this.http = http.createServer(this.express)

    this.express.use('/__h', express.urlencoded({ extended: true }))
    this.express.use('/__h', express.text({ type: 'text/plain' }))

    if (limit) {
      const limiter = rateLimit({
        ...(limit === true
          ? { windowMs: 60 * 1000, max: 120 }
          : { windowMs: limit.interval, max: limit.max }),
        standardHeaders: true,
        legacyHeaders: false,
      })

      this.express.use('/__h', limiter)
    }

    if (origins) this.setCORS(origins)

    if (this.server.requestListener) {
      this.http.on(ServerEvents.REQUEST, this.server.requestListener)
    }

    this.express.post('/__h', this.requestHandler)

    this.authMiddleware = this.authMiddleware.bind(this)
    this.contextMiddleware = this.contextMiddleware.bind(this)
  }

  setCORS(origins: string[]) {
    this.express.use(
      cors({
        credentials: true,
        origin: function (
          origin: string | undefined,
          callback: (err: Error | null, result?: boolean) => void,
        ) {
          if (!origin || origins.includes(origin)) return callback(null, true)

          callback(new Error('Not allowed by CORS'))
        },
      }),
    )
  }

  async getServerContext(clientNode: ClientNode, context: any = {}) {
    const token = clientNode.req.headers[TOKEN_HEADER_KEY] as string

    if (isString(token) && token.length && token !== 'undefined') {
      context.token = token.replace('Bearer ', '')
    }

    if (this.server.auth instanceof Function) {
      let result = this.server.auth.call(clientNode, context ?? {})

      result = result instanceof Promise ? await result : result

      return result
    }

    return false
  }

  requestHandler = async (req: express.Request, res: express.Response) => {
    let uuid
    let payload

    try {
      const transport: RequestTransport =
        req.body && isString(req.body) ? EJSON.parse(req.body) : {}

      if (!transport.payload) {
        return res.send(
          Presentation.encode({
            type: PayloadType.ERROR,
            message: Errors.INVALID_REQUEST,
          }),
        )
      }

      payload = transport.payload

      const method = this.server.getMethod(payload.method)

      const clientId = req.headers[CLIENT_ID_HEADER_KEY] as string
      const clientNode = new ClientNode(this.server, null, req, res)
      clientNode.uuid = clientId

      if (!method) {
        return res.send(
          Presentation.encode({
            type: PayloadType.ERROR,
            message: Errors.METHOD_NOT_FOUND,
            method: payload.method,
          }),
        )
      }

      const serverContext = await this.getServerContext(
        clientNode,
        transport.context,
      )

      clientNode.authenticated = Boolean(serverContext)
      clientNode.setContext(serverContext)

      if (method.isProtected && !clientNode.authenticated) {
        return res.send(
          Presentation.encode({
            type: PayloadType.ERROR,
            message: Errors.METHOD_FORBIDDEN,
            method: payload.method,
          }),
        )
      }

      uuid = payload?.uuid ? { uuid: payload.uuid } : null

      const result = await method.exec(payload.params, clientNode)

      res.send(
        Presentation.encode({
          type: PayloadType.RESULT,
          uuid: payload.uuid,
          method: payload.method,
          result,
        }),
      )
    } catch (error) {
      console.error(error)

      if (payload?.void) return

      if (error instanceof PublicError) {
        return res.send(
          Presentation.encode({
            type: PayloadType.ERROR,
            message: error.message,
            ...uuid,
          }),
        )
      }

      if (error instanceof SchemaValidationError) {
        return res.send(
          Presentation.encode({
            type: PayloadType.ERROR,
            message: error.message,
            errors: error.errors,
            ...uuid,
          }),
        )
      }

      return res.send(
        Presentation.encode({
          type: PayloadType.ERROR,
          message: Errors.INTERNAL_ERROR,
          ...uuid,
        }),
      )
    }
  }

  async contextMiddleware(req, res, next) {
    const clientNode = new ClientNode(this.server, null, req, res)

    req.context = await this.getServerContext(clientNode)

    next()
  }

  async authMiddleware(req, res, next) {
    const clientNode = new ClientNode(this.server, null, req, res)

    const serverContext = await this.getServerContext(clientNode)

    if (serverContext === false) {
      res.status(403)

      return res.end('403 Forbidden')
    }

    req.context = serverContext

    next()
  }

  static(path: string, catchAll: boolean) {
    const middleware = express.static(path)

    this.express.use('/', middleware)

    if (catchAll) {
      this.express.use(/(.*)/, middleware)
    }
  }

  /**
   * Need to close WebSocket server first.
   */
  close() {
    return new Promise<void>(resolve => {
      if (!this.http) {
        this.server.emit(HttpTransportEvents.HTTP_SERVER_CLOSED)
        return resolve()
      }

      this.http.closeAllConnections()

      this.http.close(() => {
        this.http.unref()
        this.http = undefined
        this.server.emit(HttpTransportEvents.HTTP_SERVER_CLOSED)
        resolve()
      })
    })
  }
}

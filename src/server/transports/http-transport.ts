import http from 'http'
import express, { Request, Response } from 'express'
import cors from 'cors'
import { RateLimit, Server } from '../server'
import { Errors, PublicError, SchemaValidationError } from '../../utils/errors'
import { ServerEvents, TOKEN_HEADER_KEY } from '../../utils/constants'
import { Presentation } from '../presentation'
import { ClientNode } from '../client-node'
import { createHttpTerminator, HttpTerminator } from 'http-terminator'

import rateLimit from 'express-rate-limit'
import { EJSON } from 'ejson2'
import { isString } from 'lodash'
import MethodCallPayload = Presentation.MethodCallPayload

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
  payload?: MethodCallPayload
}

export class HttpTransport {
  server: Server
  http: http.Server
  httpTerminator: HttpTerminator
  express: express.Express

  constructor(server: Server, origins: string[], limit: RateLimit) {
    this.server = server
    this.http = http.createServer()

    this.httpTerminator = createHttpTerminator({
      server: this.http,
    })

    this.express = express()
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

    this.http.on(ServerEvents.REQUEST, this.express)

    this.express.post('/__h', this.requestHandler)

    this.http.listen(server.port, () => {
      this.server.debugger(`Helene HTTP Transport: Listening on ${server.port}`)
      this.server.emit(ServerEvents.LISTENING)
    })

    this.authMiddleware = this.authMiddleware.bind(this)
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

  async getServerContext(req: Request, context) {
    if (!context) {
      const token = req.headers.authorization.replace('Bearer ', '')

      if (token)
        context = { token: req.headers.authorization.replace('Bearer ', '') }
    }

    if (this.server.auth instanceof Function) {
      let result = this.server.auth.call(req, context)

      result = result instanceof Promise ? await result : result

      return result
    }

    return false
  }

  requestHandler = async (req: Request, res: Response) => {
    let uuid
    let payload

    try {
      const transport: RequestTransport =
        req.body && isString(req.body) ? EJSON.parse(req.body) : {}

      if (!transport.payload) {
        return res.json(
          Presentation.Outbound.error(
            {
              message: Errors.INVALID_REQUEST,
            },
            true,
          ),
        )
      }

      payload = transport.payload

      const method = this.server.getMethod(payload.method)

      const clientNode = new ClientNode(this.server, null, req, res)

      if (!method) {
        return res.json(
          Presentation.Outbound.error(
            {
              message: Errors.METHOD_NOT_FOUND,
              method: payload.method,
            },
            true,
          ),
        )
      }

      if (method.isProtected) {
        const serverContext = await this.getServerContext(
          req,
          transport.context,
        )

        if (serverContext === false) {
          return res.json(
            Presentation.Outbound.error(
              {
                message: Errors.METHOD_FORBIDDEN,
                method: payload.method,
              },
              true,
            ),
          )
        }

        clientNode.authenticated = Boolean(serverContext)
        clientNode.setContext(serverContext)

        if (!serverContext?.user || !serverContext?.user?._id) {
          throw new Error(
            'The auth function must return a user object with a valid "_id" property',
          )
        }

        clientNode.userId = serverContext.user._id
      }

      uuid = payload?.uuid ? { uuid: payload.uuid } : null

      const result = await method.exec(payload.params, clientNode)

      res.send(EJSON.stringify(result))
    } catch (error) {
      console.error(error)

      if (payload.void) return

      if (error instanceof PublicError) {
        return Presentation.Outbound.error({
          message: error.message,
          stack: error.stack,
          ...uuid,
        })
      }

      if (error instanceof SchemaValidationError) {
        return Presentation.Outbound.error({
          message: error.message,
          errors: error.errors,
          ...uuid,
        })
      }

      return Presentation.Outbound.error({
        message: Errors.INTERNAL_ERROR,
        stack: error.stack,
        ...uuid,
      })
    }
  }

  async authMiddleware(req, res, next) {
    const serverContext = await this.getServerContext(req, {
      token: req.headers[TOKEN_HEADER_KEY],
    })

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
      this.express.use('*', middleware)
    }
  }

  /**
   * Need to close WebSocket server first.
   */
  close() {
    return new Promise<void>((resolve, reject) => {
      if (!this.httpTerminator) resolve()

      this.httpTerminator
        .terminate()
        .then(() => {
          this.http = undefined
          this.server.emit(HttpTransportEvents.HTTP_SERVER_CLOSED)
          resolve()
        })
        .catch(reject)
    })
  }
}

import http from 'http'
import express, { Request, Response } from 'express'
import cors from 'cors'
import { Server } from '../server'
import { Errors, PublicError, SchemaValidationError } from '../../errors'
import url from 'url'
import { ServerEvents, TOKEN_HEADER_KEY } from '../../constants'
import { Presentation } from '../presentation'
import { ClientNode } from '../client-node'
import { createHttpTerminator, HttpTerminator } from 'http-terminator'
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

  constructor(server: Server, origins?: string[]) {
    this.server = server
    this.http = http.createServer()

    this.httpTerminator = createHttpTerminator({
      server: this.http,
    })

    this.express = express()
    this.express.use(express.json())

    if (origins) this.setCORS(origins)

    if (this.server.requestListener) {
      this.http.on(ServerEvents.REQUEST, this.server.requestListener)
    }

    this.http.on(ServerEvents.REQUEST, this.express)

    this.endpoint()

    this.http.listen(server.port, () => {
      this.server.debugger(`Helene HTTP Transport: Listening on ${server.port}`)
      this.server.emit(HttpTransportEvents.HTTP_LISTENING)
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

  endpoint() {
    this.express.post('/__h/*', async (req: Request, res: Response) => {
      const { pathname } = url.parse(req.originalUrl, true)

      const namespace = this.server.getNamespace(pathname.replace('/__h', ''))

      const transport: RequestTransport = req.body ?? {}

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

      const payload = transport.payload

      const method = namespace.getMethod(payload.method)

      const clientNode = new ClientNode(null, req, res)

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

      const uuid = payload?.uuid ? { uuid: payload.uuid } : null

      try {
        const result = await method.exec(payload.params, clientNode)

        res.json(result)
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
    })
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
      console.log('Closing HTTP Transport...')

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

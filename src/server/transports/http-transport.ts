import http from 'http'
import express, { Request, Response } from 'express'
import cors from 'cors'
import { RateLimit, Server } from '../server'
import {
  CLIENT_ID_HEADER_KEY,
  Errors,
  HeleneEvents,
  PublicError,
  SchemaValidationError,
  ServerEvents,
  TOKEN_HEADER_KEY,
} from '../../utils'
import { Presentation } from '../../utils/presentation'
import { ClientNode } from '../client-node'
import { createHttpTerminator, HttpTerminator } from 'http-terminator'

import rateLimit from 'express-rate-limit'
import { EJSON } from 'ejson2'
import { isString } from 'lodash'

import 'express-async-errors'
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

  eventSourceClients: Map<string, ClientNode> = new Map()

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

    this.express.get('/__h', this.eventSourceHandler)

    this.http.listen(server.port, () => {
      this.server.debugger(`Helene HTTP Transport: Listening on ${server.port}`)
      this.server.emit(ServerEvents.HTTP_LISTENING)
    })

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
    const token = (clientNode.req.headers[TOKEN_HEADER_KEY] as string)?.replace(
      'Bearer ',
      '',
    )

    if (token) {
      context.token = token
    }

    if (this.server.auth instanceof Function) {
      let result = this.server.auth.call(clientNode, context ?? {})

      result = result instanceof Promise ? await result : result

      return result
    }

    return false
  }

  eventSourceHandler = async (req, res) => {
    const clientId = req.headers[CLIENT_ID_HEADER_KEY] as string

    if (!clientId) {
      return res.status(400).send('400 Bad Request')
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
    })

    const clientNode = new ClientNode(
      this.server,
      null,
      req,
      res,
      this.server.rateLimit,
    )
    clientNode.uuid = clientId
    clientNode.isEventSource = true

    clientNode.setTrackingProperties(req)

    const serverContext = await this.getServerContext(clientNode)

    clientNode.authenticated = Boolean(serverContext)
    clientNode.setContext(serverContext)

    this.eventSourceClients.set(clientId, clientNode)

    this.server.emit(ServerEvents.CONNECTION, clientNode)

    console.log('event source connected', clientNode.uuid)

    // Needs to send an event to the client immediately to `onopen` is triggered
    clientNode.sendEvent(HeleneEvents.SERVER_SENT_EVENTS_CONNECTED)

    const keepAliveInterval = setInterval(() => {
      clientNode.sendEvent(HeleneEvents.KEEP_ALIVE)
    }, ClientNode.KEEP_ALIVE_INTERVAL)

    res.write('retry: 1000\n')
    res.write('heartbeatTimeout: 600000\n')

    req.on('close', () => {
      console.log('event source closed', clientNode.uuid)

      clientNode.close()

      clearInterval(keepAliveInterval)

      this.eventSourceClients.delete(clientId)
      this.server.deleteClient(clientNode)
    })
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

      const clientId = req.headers[CLIENT_ID_HEADER_KEY] as string
      const clientNode = new ClientNode(this.server, null, req, res)
      clientNode.uuid = clientId

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

      const serverContext = await this.getServerContext(
        clientNode,
        transport.context,
      )

      clientNode.authenticated = Boolean(serverContext)
      clientNode.setContext(serverContext)

      if (method.isProtected && !clientNode.authenticated) {
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

      uuid = payload?.uuid ? { uuid: payload.uuid } : null

      const result = await method.exec(payload.params, clientNode)

      res.send(
        Presentation.Outbound.result({
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
          Presentation.Outbound.error({
            message: error.message,
            stack: error.stack,
            ...uuid,
          }),
        )
      }

      if (error instanceof SchemaValidationError) {
        return res.send(
          Presentation.Outbound.error({
            message: error.message,
            errors: error.errors,
            ...uuid,
          }),
        )
      }

      return res.send(
        Presentation.Outbound.error({
          message: Errors.INTERNAL_ERROR,
          stack: error.stack,
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
      this.express.use('*', middleware)
    }
  }

  /**
   * Need to close WebSocket server first.
   */
  close() {
    return new Promise<void>((resolve, reject) => {
      for (const client of this.eventSourceClients.values()) {
        client.close()
      }

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

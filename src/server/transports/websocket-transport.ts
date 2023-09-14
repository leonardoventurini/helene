import WebSocket from 'ws'
import { Server } from '../server'
import {
  Errors,
  HELENE_WS_PATH,
  Methods,
  Presentation,
  PublicError,
  SchemaValidationError,
  ServerEvents,
  WebSocketEvents,
} from '../../utils'
import http from 'http'
import { ClientNode } from '../client-node'
import IsomorphicWebSocket from 'isomorphic-ws'
import MethodCallPayload = Presentation.MethodCallPayload

export enum WebSocketTransportEvents {
  WEBSOCKET_SERVER_ERROR = 'websocket:server:error',
  WEBSOCKET_SERVER_CLOSED = 'websocket:server:closed',
}

export type WebSocketMessageOptions = Parameters<IsomorphicWebSocket['send']>[1]

export class WebSocketTransport {
  server: Server
  wss: WebSocket.Server
  options: WebSocket.ServerOptions = {
    noServer: true,
    path: HELENE_WS_PATH,
  }

  constructor(server: Server, opts: WebSocket.ServerOptions) {
    this.server = server

    Object.assign(this.options, opts ?? {})

    this.wss = new WebSocket.Server(this.options)

    this.wss.on(WebSocketEvents.CONNECTION, this.handleConnection)

    this.wss.on(WebSocketEvents.ERROR, error =>
      server.emit(WebSocketTransportEvents.WEBSOCKET_SERVER_ERROR, error),
    )

    this.server.httpTransport.http.on(
      ServerEvents.UPGRADE,
      (request, socket, head) => {
        // Allows other upgrade requests to work alongside Helene, e.g. NextJS HMR.
        if (!request.url.startsWith(this.options.path)) return
        if (!this.server.acceptConnections) {
          socket.write(
            `HTTP/${request.httpVersion} 503 Service Unavailable\r\n\r\n`,
          )
          socket.destroy()
          console.log('Helene: Upgrade Connection Refused')
          return
        }

        this.wss.handleUpgrade(request, socket, head, socket => {
          this.wss.emit(WebSocketEvents.CONNECTION, socket, request)
        })
      },
    )
  }

  handleConnection = (socket: WebSocket, request: http.IncomingMessage) => {
    const node = new ClientNode(
      this.server,
      socket,
      undefined,
      undefined,
      this.server.rateLimit,
    )

    node.setId(request)
    node.setTrackingProperties(request)

    this.server.addClient(node)

    socket.on(WebSocketEvents.CLOSE, this.handleClose(node))

    socket.on(WebSocketEvents.ERROR, error =>
      this.server.emit(ServerEvents.SOCKET_ERROR, socket, error),
    )

    socket.on(WebSocketEvents.MESSAGE, this.handleMessage(node))

    this.server.emit(ServerEvents.CONNECTION, node)
  }

  handleClose = (node: ClientNode) => () => {
    node.close()
    this.server.deleteClient(node)
  }

  handleMessage = (node: ClientNode) => async (data: WebSocket.Data) => {
    if (Buffer.isBuffer(data)) data = data.toString()

    const opts = {
      binary: data instanceof ArrayBuffer,
    }

    try {
      if (node.readyState !== 1) {
        console.warn(`Socket Not Ready`, node.readyState, node.uuid)
        return
      }

      const parsedData = Presentation.decode<MethodCallPayload>(data)

      if (parsedData.method !== Methods.KEEP_ALIVE)
        this.server.debugger(`Message Received`, parsedData)

      await this.execute(parsedData, node)
    } catch (error) {
      return node.error(
        {
          message: Errors.PARSE_ERROR,
          stack: error.stack,
        },
        opts,
      )
    }
  }

  async execute(
    payload: Presentation.MethodCallPayload,
    node: ClientNode,
  ): Promise<void> {
    if (node.limiter && !node.limiter.tryRemoveTokens(1)) {
      return node.error({
        uuid: payload.uuid,
        message: Errors.RATE_LIMIT_EXCEEDED,
        method: payload.method,
      })
    }

    const uuid = payload?.uuid ? { uuid: payload.uuid } : null

    if (payload.method !== Methods.KEEP_ALIVE)
      this.server.debugger(`Executing`, payload)

    const method = this.server.methods.get(payload.method)

    if (!method)
      return node.error({
        uuid: payload.uuid,
        message: Errors.METHOD_NOT_FOUND,
        method: payload.method,
      })

    if (method.isProtected && !node.authenticated)
      return node.error({
        uuid: payload.uuid,
        message: Errors.METHOD_FORBIDDEN,
        method: payload.method,
      })

    try {
      const methodPromise = method.exec(payload.params, node)

      if (payload.void) return

      const response = await methodPromise

      return node.result({
        uuid: payload.uuid,
        method: payload.method,
        result: response,
      })
    } catch (error) {
      console.error(error)

      if (payload.void) return

      if (error instanceof PublicError) {
        return node.error({
          message: error.message,
          stack: error.stack,
          ...uuid,
        })
      }

      if (error instanceof SchemaValidationError) {
        return node.error({
          message: error.message,
          errors: error.errors,
          ...uuid,
        })
      }

      return node.error({
        message: Errors.INTERNAL_ERROR,
        stack: error.stack,
        ...uuid,
      })
    }
  }

  close() {
    return new Promise<void>((resolve, reject) => {
      if (!this.wss) return resolve()

      this.wss.clients.forEach(socket => {
        socket.terminate()
      })

      /**
       * @todo Clean all client nodes from namespace and events.
       */

      this.wss.close(err => {
        if (err) return reject(err)

        this.wss = undefined
        this.server.emit(WebSocketTransportEvents.WEBSOCKET_SERVER_CLOSED)
        resolve()
      })
    })
  }
}

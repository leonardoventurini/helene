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
} from '@helenejs/utils'
import { ClientNode } from '../client-node'
import sockjs from 'sockjs'
import MethodCallPayload = Presentation.MethodCallPayload

export enum WebSocketTransportEvents {
  WEBSOCKET_SERVER_ERROR = 'websocket:server:error',
  WEBSOCKET_SERVER_CLOSED = 'websocket:server:closed',
}

export class WebSocketTransport {
  server: Server
  wss: sockjs.Server

  options: sockjs.ServerOptions = {
    prefix: HELENE_WS_PATH,
  }

  connections: Set<sockjs.Connection> = new Set()

  constructor(server: Server, opts: sockjs.ServerOptions) {
    this.server = server

    Object.assign(this.options, opts ?? {})

    this.wss = sockjs.createServer(this.options)

    this.wss.on(WebSocketEvents.CONNECTION, this.handleConnection)

    this.wss.on(WebSocketEvents.ERROR, error =>
      server.emit(WebSocketTransportEvents.WEBSOCKET_SERVER_ERROR, error),
    )

    this.wss.installHandlers(this.server.httpTransport.http, {
      prefix: this.options.prefix,
    })
  }

  handleConnection = (connection: sockjs.Connection) => {
    if (!this.server.acceptConnections) {
      return connection.close()
    }

    this.connections.add(connection)

    const node = new ClientNode(
      this.server,
      connection,
      undefined,
      undefined,
      this.server.rateLimit,
    )

    node.setId(connection)
    node.setTrackingProperties(connection)

    this.server.addClient(node)

    connection.on(WebSocketEvents.CLOSE, this.handleClose(node))

    connection.on(WebSocketEvents.ERROR, error =>
      this.server.emit(ServerEvents.SOCKET_ERROR, connection, error),
    )

    connection.on(WebSocketEvents.DATA, this.handleMessage(node))

    this.server.emit(ServerEvents.CONNECTION, node)
  }

  handleClose = (node: ClientNode) => () => {
    this.connections.delete(node.socket)
    node.close()
    this.server.deleteClient(node)
  }

  handleMessage = (node: ClientNode) => async (data: string) => {
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
      return node.error({
        message: Errors.PARSE_ERROR,
        stack: error.stack,
      })
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

      this.connections.forEach(socket => {
        socket.close()
      })

      this.server.emit(WebSocketTransportEvents.WEBSOCKET_SERVER_CLOSED)

      resolve()
    })
  }
}

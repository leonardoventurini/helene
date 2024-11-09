import {
  Errors,
  HELENE_WS_PATH,
  PayloadType,
  Presentation,
  PublicError,
  SchemaValidationError,
  ServerEvents,
  WebSocketEvents,
} from '@helenejs/utils'
import IsomorphicWebSocket from 'isomorphic-ws'
import sockjs from 'sockjs'
import WebSocket from 'ws'
import { ClientNode } from '../client-node'
import { Server } from '../server'
import Payload = Presentation.Payload

export enum WebSocketTransportEvents {
  WEBSOCKET_SERVER_ERROR = 'websocket:server:error',
  WEBSOCKET_SERVER_CLOSED = 'websocket:server:closed',
}

export type WebSocketMessageOptions = Parameters<IsomorphicWebSocket['send']>[1]

export class WebSocketTransport {
  server: Server
  wss: sockjs.Server
  options: WebSocket.ServerOptions = {
    noServer: true,
    path: HELENE_WS_PATH,
  }

  constructor(server: Server, opts: Partial<WebSocket.ServerOptions>) {
    this.server = server

    Object.assign(this.options, opts ?? {})

    this.wss = sockjs.createServer({
      heartbeat_delay: 45 * 1000,
      disconnect_delay: 60 * 1000,
      log: () => {},
    })

    this.wss.on(WebSocketEvents.CONNECTION, this.handleConnection)

    this.wss.on(WebSocketEvents.ERROR, (error: any) =>
      server.emit(WebSocketTransportEvents.WEBSOCKET_SERVER_ERROR, error),
    )

    this.wss.installHandlers(this.server.httpTransport.http, {
      prefix: this.options.path,
    })
  }

  handleConnection = (conn: sockjs.Connection) => {
    if (!this.server.acceptConnections) {
      conn.destroy()
      console.log('Helene: Connection Refused')
      return
    }

    const node = new ClientNode(
      this.server,
      conn,
      undefined,
      undefined,
      this.server.rateLimit,
    )

    node.setTrackingProperties(conn)

    conn.on('close', this.handleClose(node))

    conn.on('error', (error: any) =>
      this.server.emit(ServerEvents.SOCKET_ERROR, conn, error),
    )

    conn.on('data', this.handleMessage(node))
  }

  handleClose = (node: ClientNode) => () => {
    node.close()
    this.server.deleteClient(node)
  }

  handleMessage = (node: ClientNode) => async (data: { data: string }) => {
    try {
      node.heartbeat.messageReceived()

      const parsedData = Presentation.decode<Payload>(data)

      if (parsedData.type === PayloadType.SETUP) {
        node.setId(parsedData.uuid)

        this.server.addClient(node)

        this.server.emit(ServerEvents.CONNECTION, node)
      }

      if (parsedData.type !== PayloadType.METHOD) return

      await this.execute(parsedData, node)
    } catch (error) {
      return node.error({
        message: Errors.PARSE_ERROR,
        stack: error.stack,
      })
    }
  }

  async execute(payload: Record<string, any>, node: ClientNode): Promise<void> {
    if (node.limiter && !node.limiter.tryRemoveTokens(1)) {
      return node.error({
        uuid: payload.uuid,
        message: Errors.RATE_LIMIT_EXCEEDED,
        method: payload.method,
      })
    }

    const uuid = payload?.uuid ? { uuid: payload.uuid } : null

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
    return new Promise<void>(resolve => {
      if (!this.wss) return resolve()

      this.server.allClients.forEach(node => {
        if (node.socket) node.close()
      })

      resolve()
    })
  }
}

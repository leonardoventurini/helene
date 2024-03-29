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
import io from 'socket.io'
import Payload = Presentation.Payload

export enum WebSocketTransportEvents {
  WEBSOCKET_SERVER_ERROR = 'websocket:server:error',
}

export class WebSocketTransport {
  server: Server
  wss: io.Server
  options: Partial<io.ServerOptions> = {
    path: HELENE_WS_PATH,
  }

  constructor(server: Server, opts: Partial<io.ServerOptions>) {
    this.server = server

    Object.assign(this.options, opts ?? {})

    this.wss = new io.Server(this.server.httpTransport.http, {
      ...this.options,
    })

    this.wss.use((socket, next) => {
      if (!this.server.acceptConnections) {
        console.log('Helene: Connection Refused')
        return next(new Error('Helene: Connection Refused'))
      }
      next()
    })

    this.wss.on(WebSocketEvents.CONNECTION, this.handleConnection)

    this.wss.on(WebSocketEvents.ERROR, (error: any) =>
      server.emit(WebSocketTransportEvents.WEBSOCKET_SERVER_ERROR, error),
    )
  }

  handleConnection = (socket: io.Socket) => {
    const node = new ClientNode(
      this.server,
      socket,
      undefined,
      undefined,
      this.server.rateLimit,
    )

    node.setId(socket.handshake.query.uuid as string)

    this.server.addClient(node)

    this.server.emit(ServerEvents.CONNECTION, node)

    node.setTrackingProperties(socket)

    socket.on('disconnect', this.handleClose(node))

    socket.on('error', (error: any) =>
      this.server.emit(ServerEvents.SOCKET_ERROR, socket, error),
    )

    socket.on('message', this.handleMessage(node))
  }

  handleClose = (node: ClientNode) => () => {
    node.close()
    this.server.deleteClient(node)
  }

  handleMessage = (node: ClientNode) => async (data: { data: string }) => {
    try {
      const parsedData = Presentation.decode<Payload>(data)

      if (parsedData.type !== Presentation.PayloadType.METHOD) return

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
    return new Promise<void>(resolve => {
      if (!this.wss) return resolve()

      this.server.allClients.forEach(node => {
        if (node.socket) node.close()
      })

      resolve()
    })
  }
}

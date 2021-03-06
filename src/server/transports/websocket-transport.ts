import WebSocket from 'ws'
import { Server } from '../server'
import { ServerEvents, WebSocketEvents } from '../../constants'
import http from 'http'
import url from 'url'
import { Errors, PublicError, SchemaValidationError } from '../../errors'
import { ClientNode } from '../client-node'
import IsomorphicWebSocket from 'isomorphic-ws'
import { Presentation } from '../presentation'
import { Methods } from '../default-methods'
import MethodCallPayload = Presentation.MethodCallPayload

export enum WebSocketTransportEvents {
  WEBSOCKET_SERVER_ERROR = 'websocket:server:error',
  WEBSOCKET_SERVER_CLOSED = 'websocket:server:closed',
}

export type WebSocketMessageOptions = Parameters<IsomorphicWebSocket['send']>[1]

export class WebSocketTransport {
  server: Server
  wss: WebSocket.Server

  constructor(server: Server, opts: WebSocket.ServerOptions) {
    this.server = server

    this.wss = new WebSocket.Server({
      noServer: true,
      ...opts,
    })

    this.wss.on(WebSocketEvents.CONNECTION, this.handleConnection)

    this.wss.on(WebSocketEvents.ERROR, error =>
      server.emit(WebSocketTransportEvents.WEBSOCKET_SERVER_ERROR, error),
    )

    this.server.httpTransport.http.on(
      ServerEvents.UPGRADE,
      (request, socket, head) => {
        this.wss.handleUpgrade(request, socket, head, socket => {
          this.wss.emit(WebSocketEvents.CONNECTION, socket, request)
        })
      },
    )
  }

  handleConnection = (socket: WebSocket, request: http.IncomingMessage) => {
    const { pathname } = url.parse(request.url, true)

    const namespace = this.server.getNamespace(pathname, true)

    const node = new ClientNode(socket)

    node.setId(request)

    namespace.addClient(node)

    node.setNamespace(namespace)

    socket.on(WebSocketEvents.CLOSE, this.handleClose(node))

    socket.on(WebSocketEvents.ERROR, error =>
      this.server.emit(ServerEvents.SOCKET_ERROR, socket, error),
    )

    socket.on(WebSocketEvents.MESSAGE, this.handleMessage(node))
  }

  handleClose = (node: ClientNode) => () => {
    node.namespace.deleteClient(node)
    this.server.emit(ServerEvents.DISCONNECTION, node)
  }

  handleMessage = (node: ClientNode) => async (data: WebSocket.Data) => {
    const opts = {
      binary: data instanceof ArrayBuffer,
    }

    try {
      if (node.readyState !== 1) {
        console.warn(`Socket Not Ready`, node.readyState, node._id)
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
    const uuid = payload?.uuid ? { uuid: payload.uuid } : null

    if (payload.method !== Methods.KEEP_ALIVE)
      this.server.debugger(`Executing`, payload)

    const { namespace } = node

    const method = namespace.methods.get(payload.method)

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
      const response = await method.exec(payload.params, node)

      if (payload.void) return

      return node.result({
        uuid: payload.uuid,
        method: payload.method,
        result: response,
      })
    } catch (error) {
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

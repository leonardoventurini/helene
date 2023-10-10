import {
  AnyFunction,
  ClientEvents,
  ClientSocketEvent,
  Environment,
  sleep,
  WebSocketEvent,
} from '@helenejs/utils'
import IsomorphicWebSocket from 'isomorphic-ws'
import { Client } from './client'
import defer from 'lodash/defer'
import { ClientSocket } from './client-socket'

export type GenericWebSocket = IsomorphicWebSocket

export const isHidden = () => {
  return Boolean(
    !Environment.isNode &&
      typeof document !== 'undefined' &&
      (document.hidden || document.visibilityState === 'hidden'),
  )
}

export function on(emitter: any, event: string, listener: AnyFunction) {
  if (emitter.on) {
    emitter.on(event, listener)
  } else {
    emitter.addEventListener(event, listener)
  }
}

export function off(emitter: any, event: string, listener: AnyFunction) {
  if (emitter.off) {
    emitter.off(event, listener)
  } else {
    emitter.removeEventListener(event, listener)
  }
}

export const once = async (ws: IsomorphicWebSocket, event: string) =>
  new Promise<void>(resolve => {
    const _once = () => {
      resolve()
      off(ws, event, _once)
    }

    on(ws, event, _once)
  })

export const waitUntilVisible = () => {
  return new Promise<void>(resolve => {
    if (!isHidden()) {
      resolve()
    } else {
      const handler = () => {
        if (!isHidden()) {
          document.removeEventListener('visibilitychange', handler)
          resolve()
        }
      }

      document.addEventListener('visibilitychange', handler)
    }
  })
}

export function connectWebSocket(url: string): Promise<GenericWebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new IsomorphicWebSocket(url)

    const timeout = setTimeout(() => {
      if (ws.readyState !== IsomorphicWebSocket.CLOSED) {
        ws.close()
      }
    }, 1000)

    const errorHandler = () => {
      clearTimeout(timeout)

      off(ws, WebSocketEvent.CLOSE, errorHandler)
      off(ws, WebSocketEvent.ERROR, errorHandler)

      ws.onerror = null
      ws.onclose = null

      reject(new Error('WebSocket connection failed'))
    }

    ws.onerror = errorHandler
    ws.onclose = errorHandler

    const openHandle = () => {
      clearTimeout(timeout)

      // Need to remove the handlers, otherwise they will
      // be called again in normal operation
      off(ws, WebSocketEvent.CLOSE, errorHandler)
      off(ws, WebSocketEvent.ERROR, errorHandler)

      ws.onopen = null
      ws.onerror = null
      ws.onclose = null

      resolve(ws)
    }

    ws.onopen = openHandle

    on(ws, WebSocketEvent.CLOSE, errorHandler)
    on(ws, WebSocketEvent.ERROR, errorHandler)

    once(ws, WebSocketEvent.OPEN).then(openHandle)
  })
}

export const MAX_DELAY = 60000

export function connectWebSocketWithPersistentReconnect(
  url: string,
  client: Client,
  clientSocket: ClientSocket,
  timeFunction = (i: number) =>
    Math.min(100 * Math.pow(i, 2), MAX_DELAY) * (0.9 + 0.2 * Math.random()),
) {
  const state = {
    stopped: false,
    attempts: 0,
  }

  let ws = null

  async function connect() {
    while (!state.stopped) {
      try {
        client.emit(ClientEvents.WEBSOCKET_CONNECT_ATTEMPT)

        ws = await connectWebSocket(url)

        state.attempts = 0

        if (state.stopped) {
          ws.close()
          break
        }

        defer(() => {
          client.emit(ClientEvents.WEBSOCKET_CONNECTED, ws)
        })

        await once(ws, 'close')

        ws = null

        await waitUntilVisible()
      } catch (error) {
        if (state.stopped) {
          break
        }

        state.attempts++

        console.error(
          `[Helene] Attempt to reconnect WebSocket ${state.attempts} failed (Client ID: ${client.uuid})`,
        )
        console.error(error)
      }

      await sleep(timeFunction(state.attempts))

      client.emit(ClientEvents.WEBSOCKET_RECONNECTING, client.uuid)
    }
  }

  connect().catch(console.error)

  clientSocket.once(ClientSocketEvent.DISCONNECT, () => {
    state.stopped = true

    if (ws && ws.readyState !== IsomorphicWebSocket.CLOSED) {
      ws?.terminate?.()
      ws?.close?.()
    } else {
      client.emit(ClientEvents.WEBSOCKET_CLOSED)
    }
  })
}

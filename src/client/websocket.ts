import { ClientEvents, Environment, sleep, WebSocketEvent } from '../utils'
import IsomorphicWebSocket from 'isomorphic-ws'
import { Client } from './client'

export type GenericWebSocket = IsomorphicWebSocket

export const isDocumentHidden = () => {
  return Boolean(
    !Environment.isNode && typeof document !== 'undefined' && document.hidden,
  )
}

export function connectWebSocket(url: string): Promise<GenericWebSocket> {
  return new Promise((resolve, reject) => {
    const errorHandler = event => {
      reject(event)
    }

    const ws = new IsomorphicWebSocket(url)

    ws.addEventListener(WebSocketEvent.CLOSE, errorHandler)
    ws.addEventListener(WebSocketEvent.ERROR, errorHandler)

    ws.addEventListener(WebSocketEvent.OPEN, () => {
      // Need to remove the handlers, otherwise they will
      // be called again in normal operation
      ws.removeEventListener(WebSocketEvent.CLOSE, errorHandler)
      ws.removeEventListener(WebSocketEvent.ERROR, errorHandler)

      resolve(ws)
    })
  })
}

export const MAX_DELAY = 60000

export const once = async (ws: IsomorphicWebSocket, event: string) =>
  new Promise(resolve => {
    ws.once(event, resolve)
  })

export function connectWebSocketWithPersistentReconnect(
  url: string,
  client: Client,
  timeFunction = (i: number) =>
    Math.min(64 * Math.pow(i, 2), MAX_DELAY) * (0.9 + 0.2 * Math.random()),
) {
  let stopped = false
  let ws = null

  async function connect() {
    stopped = false

    let attempts = 0

    while (!stopped) {
      try {
        ws = await connectWebSocket(url)

        attempts = 0

        if (stopped) {
          ws.close()
          break
        }

        client.emit(ClientEvents.WEBSOCKET_CONNECTED, ws)

        await once(ws, 'close')

        ws = null
      } catch (error) {
        if (attempts > 10) {
          console.error(
            `[Helene] Attempt to reconnect WebSocket ${attempts + 1} failed`,
          )
        }

        // If not closed locally by the client, we log the error
        if (error.code !== 1006) {
          console.error(error)
        }

        attempts++
      }

      await sleep(timeFunction(attempts))
    }
  }

  connect()

  return {
    disconnect() {
      stopped = true

      if (ws) {
        ws.close()
      }
    },
  }
}

import { ClientEvents, Environment, sleep, WebSocketEvent } from '../utils'
import IsomorphicWebSocket from 'isomorphic-ws'
import { Client } from './client'
import prettyBytes from 'pretty-bytes'

export type GenericWebSocket = IsomorphicWebSocket

export const isHidden = () => {
  return Boolean(
    !Environment.isNode &&
      typeof document !== 'undefined' &&
      (document.hidden || document.visibilityState === 'hidden'),
  )
}

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
    const errorHandler = (event: any) => {
      reject(event)

      ws.off(WebSocketEvent.CLOSE, errorHandler)
      ws.off(WebSocketEvent.ERROR, errorHandler)
    }

    const ws = new IsomorphicWebSocket(url)

    ws.on(WebSocketEvent.CLOSE, errorHandler)
    ws.on(WebSocketEvent.ERROR, errorHandler)

    ws.once(WebSocketEvent.OPEN, () => {
      // Need to remove the handlers, otherwise they will
      // be called again in normal operation
      ws.off(WebSocketEvent.CLOSE, errorHandler)
      ws.off(WebSocketEvent.ERROR, errorHandler)

      resolve(ws)
    })
  })
}

let instanceNo = 0

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
  instanceNo++

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

        await waitUntilVisible()
      } catch (error) {
        if (stopped) {
          break
        }

        attempts++

        console.error(
          `[Helene] Attempt to reconnect WebSocket ${attempts} failed (Instance ${instanceNo}) ${JSON.stringify(
            stopped,
          )}`,
          prettyBytes(process.memoryUsage().heapUsed),
        )
        console.dir(error)
      }

      await sleep(timeFunction(attempts))

      client.emit(ClientEvents.WEBSOCKET_RECONNECTING, attempts)
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

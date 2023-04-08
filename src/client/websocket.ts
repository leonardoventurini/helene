import {
  BackoffEvent,
  ClientEvents,
  Environment,
  sleep,
  WebSocketEvent,
} from '../utils'
import { Client } from './client'
import IsomorphicWebSocket from 'isomorphic-ws'
import { exponential } from '../utils/backoff'

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

export async function connectWithRetry(
  url: string,
  client: Client,
  attempts = 4,
) {
  for (let i = 0; i < attempts; i++) {
    try {
      client.emit(ClientEvents.WEBSOCKET_CONNECT_ATTEMPT)

      // Connection successful; exit the loop and return the WebSocket instance
      const ws = (await connectWebSocket(url)) as GenericWebSocket

      setTimeout(() => {
        client.emit(ClientEvents.WEBSOCKET_CONNECTED, ws)
      }, 0)

      return ws
    } catch (error) {
      // eslint-disable-next-line no-console,max-len
      console.error(`Helene: Attempt ${i + 1} of ${attempts} failed`)
      if (i + 1 === attempts) {
        throw error
      }
    }
    // Wait for a while before retrying (e.g., 1000ms)
    await new Promise(resolve => setTimeout(resolve, connectWithRetry._timeout))
  }
}

connectWithRetry._timeout = 5000

export async function connectWithBackoff(url: string, client: Client) {
  let ws = null

  const _backoff = exponential({
    randomisationFactor: 1,
    initialDelay: 64,
    maxDelay: connectWithBackoff._maxDelay,
  })

  const onDisconnect = () => {
    if (ws) {
      ws.removeAllListeners()
      ws.close()
      ws = null
    }

    _backoff.reset()

    client.off(ClientEvents.DISCONNECT, onDisconnect)
  }

  client.on(ClientEvents.DISCONNECT, onDisconnect)

  const connect = async () => {
    try {
      ws = await connectWithRetry(url, client)

      await client.waitFor(ClientEvents.WEBSOCKET_CONNECTED)

      _backoff.reset()

      ws.on(WebSocketEvent.CLOSE, code => {
        if (code === 1000) return
        if (!client.clientSocket.options.reconnect) return
        if (client.clientSocket.closedGracefully) return
        if (isDocumentHidden()) return

        _backoff.backoff(code)
      })
    } catch (error) {
      _backoff.backoff(error)
    }
  }

  _backoff.failAfter(client.clientSocket.options.reconnectRetries)

  _backoff.on(BackoffEvent.READY, async (number, delay) => {
    client.emit(ClientEvents.WEBSOCKET_BACKOFF_READY, number, delay)
  })

  _backoff.on(BackoffEvent.BACKOFF, async (number, delay, error) => {
    // eslint-disable-next-line no-console,max-len
    console.log(
      `Helene: Reconnection attempt #${number + 1} with a delay of ${delay}ms`,
    )
    client.emit(ClientEvents.WEBSOCKET_BACKOFF, number, delay, error)
    await sleep(delay)
    await connect()
  })

  _backoff.on(BackoffEvent.FAIL, () => {
    // eslint-disable-next-line no-console,max-len
    console.error('Helene: Reconnection Failed (Exhausted Backoff)')
    client.emit(ClientEvents.WEBSOCKET_BACKOFF_FAIL)
  })

  await connect()
}

connectWithBackoff._maxDelay = 60000

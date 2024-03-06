import SockJS from 'sockjs-client'
import { ClientSocket } from './client-socket'

export function connectSockJS(
  url: string,
  clientSocket: ClientSocket,
  attempt = 1,
) {
  if (clientSocket.stopped) {
    return
  }

  if (attempt > 1) {
    console.log('Helene: Reconnecting...')
  }

  const sock = new SockJS(url)

  clientSocket.socket = sock

  sock.onopen = clientSocket.handleOpen.bind(clientSocket)

  sock.onclose = function () {
    console.log('Helene: Connection Closed')
    setTimeout(function () {
      connectSockJS(url, clientSocket, attempt + 1)
    }, calculateReconnectionDelay(attempt))
  }
}

export function calculateReconnectionDelay(attempt: number) {
  const maxDelay = 30000
  const delay = calculateReconnectionDelay.initialDelay * attempt
  return Math.min(delay, maxDelay)
}

calculateReconnectionDelay.initialDelay = 1000

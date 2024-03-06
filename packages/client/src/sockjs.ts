import { ClientSocket } from './client-socket'

export async function connectSockJS(
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

  let sock

  if (typeof window === 'undefined') {
    const { default: NodeSockJS } = await import('sockjs-client')

    // @ts-ignore
    sock = new NodeSockJS(url)
  } else {
    const { default: BrowserSockJS } = await import(
      'sockjs-client/dist/sockjs.min.js'
    )

    sock = new BrowserSockJS(url)
  }

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

import { ClientEvents, sleep } from '@helenejs/utils'
import EventSource from 'eventsource'
import { TestUtility } from './test-utility'
import { expect } from 'chai'
import WebSocket from 'ws'

describe('idleness', () => {
  const test = new TestUtility()

  it('should disconnect on idleness and reconnect upon interaction (http sse)', async () => {
    const client = await test.createHttpClient({
      idlenessTimeout: 100,
    })

    await client.waitFor(ClientEvents.EVENTSOURCE_CLOSE)

    expect(client.clientHttp.clientEventSource).to.be.null

    client.idleTimeout.reset()

    await client.waitFor(ClientEvents.EVENTSOURCE_CREATE)

    expect(client.clientHttp.clientEventSource.readyState).to.equal(
      EventSource.CONNECTING,
    )

    await client.waitFor(ClientEvents.EVENTSOURCE_OPEN)

    expect(client.clientHttp.clientEventSource.readyState).to.equal(
      EventSource.OPEN,
    )

    await client.close()
  }).timeout(60000)

  it('should disconnect on idleness and reconnect upon interaction (websocket)', async () => {
    const client = await test.createClient({
      idlenessTimeout: 100,
    })

    await client.waitFor(ClientEvents.WEBSOCKET_CLOSED)

    expect(client.clientSocket.socket).to.be.undefined

    await client.idleTimeout.reset()

    expect(client.clientSocket.socket.readyState).to.equal(WebSocket.OPEN)

    for (let i = 0; i < 20; i++) {
      await sleep(50)
      await client.idleTimeout.reset()
    }

    expect(client.clientSocket.socket.readyState).to.equal(WebSocket.OPEN)

    await client.close()
  }).timeout(60000)
})

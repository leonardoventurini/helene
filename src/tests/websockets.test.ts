import { describe, it } from 'mocha'
import { expect } from 'chai'
import { ClientEvents } from '../utils'
import { connectWithRetry } from '../client/websocket'
import { TestUtility } from './utils/test-utility'

describe('WebSockets', function () {
  const test = new TestUtility()

  it('should close and reconnect', async () => {
    await test.client.close()

    expect(test.client.clientSocket.ready).to.be.false

    await test.client.connect()

    expect(test.client.clientSocket.ready).to.be.true
  })

  it('should attempt to reconnect, fail, and then succeed to connect manually', async () => {
    test.client.clientSocket.options.reconnect = true
    test.client.clientSocket.options.reconnectRetries = 3

    connectWithRetry._timeout = 10
    test.server.acceptConnections = false

    await test.client.close(true)

    expect(test.client.clientSocket.ready).to.be.false

    await test.client.waitFor(ClientEvents.WEBSOCKET_BACKOFF_FAIL)

    test.server.acceptConnections = true

    await test.client.connect()

    expect(test.client.clientSocket.ready).to.be.true
  })

  it('should attempt connection 4x and use the backoff strategy for maximum reliability', async () => {
    connectWithRetry._timeout = 10

    let attemptCount = 0
    let backoffCount = 0

    test.server.acceptConnections = false

    const client = await test.createClient({ ws: { autoConnect: false } })

    client.on(ClientEvents.WEBSOCKET_CONNECT_ATTEMPT, () => {
      attemptCount++
    })

    client.on(ClientEvents.WEBSOCKET_BACKOFF, () => {
      backoffCount++
    })

    client.connect()

    await client.waitFor(ClientEvents.WEBSOCKET_BACKOFF_FAIL)

    test.server.acceptConnections = true

    expect(attemptCount).to.be.equal(16)
    expect(backoffCount).to.be.equal(3)
  }).timeout(10000)
})

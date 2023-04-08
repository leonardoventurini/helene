import { describe, it } from 'mocha'
import { expect } from 'chai'
import { ClientEvents } from '../utils'
import { connectWithBackoff, connectWithRetry } from '../client/websocket'
import { TestUtility } from './utils/test-utility'

describe('WebSockets', function () {
  const test = new TestUtility()

  it('should attempt connection 4x and use the backoff strategy for maximum reliability', async () => {
    connectWithRetry._timeout = 10
    connectWithBackoff._failAfter = 3

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

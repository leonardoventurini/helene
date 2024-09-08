import { describe, it } from 'mocha'
import { expect } from 'chai'
import { TestUtility } from '../test-utility'
import defer from 'lodash/defer'
import { ClientEvents, HeleneEvents, sleep } from '@helenejs/utils'
import { Client } from '@helenejs/client'
import { Heartbeat } from '@helenejs/server/lib/heartbeat'

describe('WebSockets', function () {
  const test = new TestUtility()

  afterEach(() => {
    Client.ENABLE_HEARTBEAT = true
    Heartbeat.HEARTBEAT_INTERVAL = 10000
  })

  it('should close and reconnect', async () => {
    await test.client.close()

    expect(test.client.clientSocket.ready).to.be.false

    await test.client.connect()

    expect(test.client.clientSocket.ready).to.be.true
  })

  it('should attempt to reconnect, fail, and then succeed to connect manually', async () => {
    test.server.acceptConnections = false

    await test.client.close()

    expect(test.client.clientSocket.ready).to.be.false

    test.server.acceptConnections = true

    await test.client.connect()

    expect(test.client.clientSocket.ready).to.be.true
  })

  it('should attempt connection more than once while the server is not accepting connections', async () => {
    let attemptCount = 0

    const client = await test.createClient()

    await client.close()

    test.server.acceptConnections = false

    client.on(ClientEvents.WEBSOCKET_RECONNECTING, () => {
      attemptCount++
    })

    defer(() => {
      client.connect().catch(console.error)
    })

    await sleep(5000)

    test.server.acceptConnections = true

    expect(attemptCount).to.be.greaterThan(1)

    await client.disconnect()
  }).timeout(10000)

  it('should detect disconnection using keep alive on the server', async () => {
    await test.client.close()

    Heartbeat.HEARTBEAT_INTERVAL = 10

    const client = await test.createClient()

    const clientNode = test.server.allClients.get(client.uuid)

    expect(clientNode).to.exist

    let keepAliveCount = 0

    client.on(HeleneEvents.HEARTBEAT, () => {
      keepAliveCount++
    })

    await sleep(100)

    expect(client.connected).to.be.true

    expect(keepAliveCount).to.be.within(2, 6)

    Client.ENABLE_HEARTBEAT = false
    client.removeAllListeners(HeleneEvents.HEARTBEAT)

    // It is normal for there to be an `ECONNREFUSED` error here

    await clientNode.waitFor(HeleneEvents.HEARTBEAT_DISCONNECT, 100)

    await sleep(0)

    // We disabled auto disconnection due to Safari iOS issues
    expect(client.connected).to.be.false
  }).timeout(10000)

  it('should call init even after it abnormally reconnects', async () => {
    test.server.allClients.get(test.client.uuid).socket.close()

    await test.client.waitFor(ClientEvents.WEBSOCKET_CLOSED)

    await test.client.waitFor(ClientEvents.INITIALIZED)
  }).timeout(5000)
})

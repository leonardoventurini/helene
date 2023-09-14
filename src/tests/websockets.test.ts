import { describe, it } from 'mocha'
import { expect } from 'chai'
import { ClientEvents, HeleneEvents, sleep } from '../utils'
import { TestUtility } from './utils/test-utility'
import { ClientNode } from '../server'
import { Client } from '../client'
import defer from 'lodash/defer'

describe('WebSockets', function () {
  const test = new TestUtility()

  it('should close and reconnect', async () => {
    await test.client.close()

    expect(test.client.clientSocket.ready).to.be.false

    await test.client.connectWebSocket()

    expect(test.client.clientSocket.ready).to.be.true
  })

  it('should attempt to reconnect, fail, and then succeed to connect manually', async () => {
    test.client.clientSocket.options.reconnect = true
    test.client.clientSocket.options.reconnectRetries = 3

    test.server.acceptConnections = false

    await test.client.close()

    expect(test.client.clientSocket.ready).to.be.false

    test.server.acceptConnections = true

    await test.client.connectWebSocket()

    expect(test.client.clientSocket.ready).to.be.true
  })

  it('should attempt connection more than once while the server is not accepting connections', async () => {
    let attemptCount = 0

    test.server.acceptConnections = false

    const client = await test.createClient({ ws: { autoConnect: false } })

    client.on(ClientEvents.WEBSOCKET_RECONNECTING, () => {
      attemptCount++
    })

    defer(() => {
      client.connectWebSocket().catch(console.error)
    })

    await sleep(3000)

    test.server.acceptConnections = true

    expect(attemptCount).to.be.greaterThan(1)

    await client.disconnect()
  }).timeout(10000)

  it('should detect disconnection using keep alive on the server', async () => {
    await test.client.close()

    ClientNode.KEEP_ALIVE_INTERVAL = 10

    const client = await test.createClient()

    const clientNode = test.server.allClients.get(client.uuid)

    expect(clientNode).to.exist

    let keepAliveCount = 0

    client.on(HeleneEvents.KEEP_ALIVE, () => {
      keepAliveCount++
    })

    await sleep(100)

    expect(client.connected).to.be.true

    expect(keepAliveCount).to.be.within(8, 12)

    client.removeAllListeners(HeleneEvents.KEEP_ALIVE)

    // It is normal for there to be an `ECONNREFUSED` error here

    await clientNode.waitFor(HeleneEvents.KEEP_ALIVE_DISCONNECT, 100)

    await client.waitFor(ClientEvents.WEBSOCKET_CLOSED, 100)

    expect(client.connected).to.be.false

    await client.close()
  }).timeout(10000)

  it('should detect disconnection using keep alive on the client', async () => {
    await test.client.close()

    ClientNode.KEEP_ALIVE_INTERVAL = 10
    Client.KEEP_ALIVE_INTERVAL = 10

    const client = await test.createClient()

    let keepAliveCount = 0

    client.on(HeleneEvents.KEEP_ALIVE, () => {
      keepAliveCount++
    })

    await sleep(100)

    expect(client.connected).to.be.true

    expect(keepAliveCount).to.be.within(9, 11)

    ClientNode.ENABLE_KEEP_ALIVE = false

    await client.waitFor(HeleneEvents.KEEP_ALIVE_DISCONNECT, 100)

    expect(client.connected).to.be.false
  }).timeout(10000)
})

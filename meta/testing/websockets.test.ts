import { describe, it } from 'mocha'
import { expect } from 'chai'
import { TestUtility } from './test-utility'
import defer from 'lodash/defer'
import { ClientEvents, HeleneEvents, sleep } from '@helenejs/utils'
import { ClientNode } from '@helenejs/server'
import { Client } from '@helenejs/client'

describe('WebSockets', function () {
  const test = new TestUtility()

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
    const attemptCount = 0

    const client = await test.createClient()

    await client.close()

    test.server.acceptConnections = false

    defer(() => {
      client.connect().catch(console.error)
    })

    await sleep(1000)

    test.server.acceptConnections = true

    await sleep(3000)

    expect(client.clientSocket.ready).to.be.true

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

    await clientNode.waitFor(HeleneEvents.KEEP_ALIVE_DISCONNECT, 200)

    await client.waitFor(ClientEvents.WEBSOCKET_CLOSED, 200)

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

  it('should call init even after it abnormally reconnects', async () => {
    test.server.allClients.get(test.client.uuid).socket.close()

    await test.client.waitFor(ClientEvents.WEBSOCKET_CLOSED)

    await test.client.waitFor(ClientEvents.INITIALIZED)
  })
})

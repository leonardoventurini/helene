import { Client } from '../../client'
import { Heartbeat } from '../../server/heartbeat'
import { ClientEvents, HeleneEvents, sleep } from '../../utils'
import { expect, describe, it, afterEach } from 'vitest'
import defer from 'lodash/defer'
import { TestUtility } from '../test-utility'

describe('WebSockets', () => {
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
  }, 10000)

  it('should call init even after it abnormally reconnects', async () => {
    defer(() => {
      test.client.clientSocket.socket.io.engine.close()
    })

    await test.client.waitFor(ClientEvents.WEBSOCKET_CLOSED)

    await test.client.waitFor(ClientEvents.INITIALIZED, 10000)
  }, 20000)

  it('should not register message and error handlers more than once after reconnection', async () => {
    // Check initial state - should have exactly one handler for each
    const socket = test.client.clientSocket.socket as any
    const initialMessageHandlers = socket._callbacks?.$message?.length || 0
    const initialErrorHandlers = socket._callbacks?.$error?.length || 0

    expect(initialMessageHandlers).toBe(1)
    expect(initialErrorHandlers).toBe(1)

    for (let i = 0; i < 10; i++) {
      await test.client.clientSocket.socket.close()
      await test.client.clientSocket.socket.connect()
      await test.client.waitFor(ClientEvents.WEBSOCKET_CONNECTED)
    }

    // After reconnection, should still have only one handler for each
    const socketAfterReconnect = test.client.clientSocket.socket as any
    const afterReconnectMessageHandlers =
      socketAfterReconnect._callbacks?.$message?.length || 0
    const afterReconnectErrorHandlers =
      socketAfterReconnect._callbacks?.$error?.length || 0

    expect(afterReconnectMessageHandlers).toBe(1)
    expect(afterReconnectErrorHandlers).toBe(1)

    // Test multiple reconnections
    for (let i = 0; i < 10; i++) {
      await test.client.clientSocket.socket.close()
      await test.client.clientSocket.socket.connect()
      await test.client.waitFor(ClientEvents.WEBSOCKET_CONNECTED)
    }

    const socketAfterSecondReconnect = test.client.clientSocket.socket as any
    const afterSecondReconnectMessageHandlers =
      socketAfterSecondReconnect._callbacks?.$message?.length || 0
    const afterSecondReconnectErrorHandlers =
      socketAfterSecondReconnect._callbacks?.$error?.length || 0

    expect(afterSecondReconnectMessageHandlers).toBe(1)
    expect(afterSecondReconnectErrorHandlers).toBe(1)
  })
})

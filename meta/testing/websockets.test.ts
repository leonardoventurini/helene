import { describe, it } from 'mocha'
import { expect } from 'chai'
import { TestUtility } from './test-utility'
import { ClientEvents } from '@helenejs/utils'

describe('WebSockets', function () {
  const test = new TestUtility()

  it('should close and reconnect', async () => {
    await test.client.close()

    console.log('After Closed')

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

    await test.client.close()
  })

  it('should call init even after it abnormally reconnects', async () => {
    expect(test.client.clientSocket.ready).to.be.true

    test.server.allClients.get(test.client.uuid).socket.conn.close(true)

    await test.client.waitFor(ClientEvents.WEBSOCKET_CLOSED)

    await test.client.waitFor(ClientEvents.WEBSOCKET_CONNECTED)
  }).timeout(5000)
})

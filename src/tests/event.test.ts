import { expect } from 'chai'
import { TestUtility } from '../utils/test-utility'
import { ClientEvents } from '../constants'

describe('Events', function () {
  const test = new TestUtility()

  it('should register an event, emit and and get the payload', async () => {
    await test.createEvent('test:event')

    test.server.defer('test:event', 16)

    const result = await test.client.wait('test:event')

    expect(result).to.equal(16)
  })

  it('should emit event without parameters', async () => {
    await test.createEvent('test:event')

    test.server.defer('test:event')

    const result = await test.client.wait('test:event')

    expect(result).to.be.true
  })

  it('should emit event with an array parameter', async () => {
    await test.createEvent('test:event')

    test.server.defer('test:event', [1, 2, 3])

    const result = await test.client.wait('test:event')

    expect(result).to.have.members([1, 2, 3])
  })

  it('should still be subscribed after reconnecting', async () => {
    await test.createEvent('test:event')

    await test.client.clientSocket.close()

    await test.client.clientSocket.connect()

    await test.client.wait(ClientEvents.INITIALIZED)

    expect(test.client.events).to.have.length(1)

    test.server.defer('test:event', [1, 2, 3])

    const result = await test.client.wait('test:event')

    expect(result).to.have.members([1, 2, 3])
  })
})

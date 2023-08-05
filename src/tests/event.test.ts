import { expect } from 'chai'
import { TestUtility } from './utils/test-utility'
import { ClientEvents, NO_CHANNEL } from '../utils'

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

  it('should try to subscribe to a protected event while unauthenticated and fail', async () => {
    const client = await test.createClient()

    test.server.addEvent('protected:event', { protected: true })

    const result = await client.subscribe('protected:event')

    expect(result).to.have.property('protected:event').that.is.false

    test.server.defer('protected:event', true)

    const eventTimeout = await test.client.timeout('protected:event')

    expect(eventTimeout).to.be.true
  })

  it('should prevent subscription based on condition', async () => {
    const client = await test.createClient()

    test.server.addEvent('protected:event', {
      shouldSubscribe: async () => false,
    })

    const result = await client.subscribe('protected:event')

    expect(result).to.have.property('protected:event').that.is.false

    test.server.defer('protected:event', true)

    const eventTimeout = await test.client.timeout('protected:event')

    expect(eventTimeout).to.be.true
  })

  it('should allow subscription based on condition', async () => {
    let params = {
      client: null,
      event: null,
      channel: null,
    }

    test.server.addEvent('open:event', {
      async shouldSubscribe(client, event, channel) {
        params = { client, event, channel }

        return true
      },
    })

    const result = await test.client.subscribe('open:event')

    expect(result).to.have.property('open:event').that.is.true

    test.server.defer('open:event', true)

    const eventTimeout = await test.client.timeout('open:event')

    expect(eventTimeout).to.be.false

    expect(params?.client?.constructor.name).to.equal('ClientNode')
    expect(params.event).to.equal('open:event')
    expect(params.channel).to.equal(NO_CHANNEL)
  })
})

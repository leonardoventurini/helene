import { Presentation } from '@helenejs/utils'
import { expect } from 'chai'
import defer from 'lodash/defer'
import { TestUtility } from '../test-utility'

describe('Channel', () => {
  const test = new TestUtility()

  it('should set boilerplate events to the namespace and add them to new channels', async () => {
    const event = 'boilerplate:event'

    test.server.addEvent(event)

    expect(test.server).to.have.property('events').that.has.lengthOf(2)

    const channelName = Presentation.uuid()
    const channel = test.server.channel(channelName)

    expect(channel.server.events.has(event)).to.be.true
  })

  it('should add event to all channels', async () => {
    const event = Presentation.uuid()
    const channelName = Presentation.uuid()
    const channel = test.server.channel(channelName)

    channel.addEvent(event)

    expect(test.server.events.has(event)).to.be.true

    channel.server.events.delete(event)

    expect(test.server).to.have.property('events').that.has.lengthOf(1)
  })

  it('should subscribe to an event in a specific channel', async () => {
    const channel = Presentation.uuid()

    const otherClient = await test.createClient()

    const event = 'channel:event'
    test.server.addEvent(event)
    test.server.channel(channel).addEvent(event)

    await otherClient.subscribe(event)
    await test.client.channel(channel).subscribe(event)

    /**
     * Make sure the default emit from EventEmitter works as expected.
     */
    defer(() => {
      test.server.channel(channel).emit(event, { test: true })
    })

    const result1 = await test.client.channel(channel).wait(event)
    const timeout1 = await otherClient.timeout(event)
    expect(result1).to.have.property('test').that.is.true
    expect(timeout1).to.be.true

    test.server.defer(event, { test: true })

    const result2 = await otherClient.wait(event)
    const timeout2 = await test.client.timeout(event)

    expect(timeout2).to.be.true
    expect(result2).to.have.property('test').that.is.true

    await otherClient.close()
  })

  it('should allow or disallow channel subscription', async () => {
    test.server.setAuth({
      auth(context: any) {
        return context?.token ? { ...context, user: { _id: 'id' } } : false
      },
      async logIn({ email, password }) {
        if (email === 'test@helene.test' && password === '123456') {
          return {
            token: 'test',
          }
        }
      },
    })

    test.server.addEvent('any:event')

    let channelName = null

    test.server.setChannelAuthorization(async (client, channel) => {
      channelName = channel

      return client.authenticated
    })

    let res = await test.client.channel('any:channel').subscribe('any:event')

    expect(res).to.have.property('any:event').that.is.false

    await test.client.login({ email: 'test@helene.test', password: '123456' })

    res = await test.client.channel('any:channel').subscribe('any:event')

    expect(res).to.have.property('any:event').that.is.true

    expect(channelName).to.be.equal('any:channel')
  })
})

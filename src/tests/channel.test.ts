import { expect } from 'chai'
import { TestUtility } from '../utils/test-utility'
import { Presentation } from '../server/presentation'
import { defer } from 'lodash'

describe('Channel', () => {
  const test = new TestUtility()

  it('should set boilerplate events to the namespace and add them to new channels', async () => {
    const event = 'boilerplate:event'

    test.server.events.add(event)

    expect(test.server).to.have.property('eventBlueprints').that.has.lengthOf(1)

    const channelName = Presentation.uuid()
    const channel = test.server.channel(channelName)

    expect(channel).to.have.property('events').that.has.lengthOf(1)

    expect(channel.events.has(event)).to.be.true
  })

  it('should add event to all channels', async () => {
    const event = Presentation.uuid()
    const channelName = Presentation.uuid()
    const channel = test.server.channel(channelName)

    channel.events.add(event)

    expect(test.server.events.has(event)).to.be.true

    channel.events.delete(event)

    expect(channel).to.have.property('events').that.has.lengthOf(0)
  })

  it('should subscribe to an event in a specific channel', async () => {
    const channel = Presentation.uuid()

    const otherClient = await test.createClient()

    const event = 'channel:event'
    test.server.events.add(event)
    test.server.channel(channel).events.add(event)

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
})

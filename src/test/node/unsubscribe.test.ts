import { expect } from 'chai'
import { TestUtility } from '../test-utility'

describe('Unsubscribe', () => {
  const test = new TestUtility()

  it('should unsubscribe from an event', async () => {
    await test.server.addEvent('test:event')

    await test.client.subscribe('test:event')

    const data = await test.client.unsubscribe('test:event')

    expect(data).to.have.property('test:event').that.is.true
  })

  it('should unsubscribe from multiple events', async () => {
    await test.server.addEvent('test:event:1')
    await test.server.addEvent('test:event:2')

    await test.client.subscribe(['test:event:1', 'test:event:2'])

    const data = await test.client.unsubscribe(['test:event:1', 'test:event:2'])

    expect(data).to.have.property('test:event:1').that.is.true

    expect(data).to.have.property('test:event:2').that.is.true
  })

  it('should unsubscribe from channel', async () => {
    await test.server.addEvent('test:event')

    await test.client.channel('test:channel').subscribe('test:event')

    expect(
      test.server.channel('test:channel').clients.get('test:event'),
    ).to.have.length(1)

    const data = await test.client
      .channel('test:channel')
      .unsubscribe('test:event')

    expect(data).to.have.property('test:event').that.is.true

    expect(
      test.server.channel('test:channel').clients.get('test:event'),
    ).to.have.length(0)
  })
})

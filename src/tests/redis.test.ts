import { expect } from 'chai'
import { RedisTestUtil } from '../utils/redis-test-util'
import { TestUtility } from '../utils/test-utility'

describe('Redis Pub/Sub', function() {
  const redis = new RedisTestUtil()
  const test1 = new TestUtility({ globalInstance: false })
  const test2 = new TestUtility({ globalInstance: false })

  it('should publish and receive message', async () => {
    redis.publishNextTick('event', 'test')

    const data = await redis.wait('message')

    expect(data)
      .to.have.property('channel')
      .that.equals('event')
    expect(data)
      .to.have.property('message')
      .that.equals('test')
  })

  it('should emit an event in one server and both clients should fire', async () => {
    await test1.createEvent('monkey:king')
    await test2.createEvent('monkey:king')

    test1.server.defer('monkey:king', 11)

    const data2 = await test2.client.wait('monkey:king')

    expect(data2).to.be.equal(11)
  })
})

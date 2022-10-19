import { expect } from 'chai'
import { RedisTestUtil } from '../utils/redis-test-util'
import { TestUtility } from '../utils/test-utility'
import { RedisTransport } from '../server/transports/redis-transport'

describe('Redis Pub/Sub', function () {
  const redis = new RedisTestUtil()
  const test1 = new TestUtility({ globalInstance: false, useRedis: true })
  const test2 = new TestUtility({ globalInstance: false, useRedis: true })

  afterEach(async () => {
    const keys = await redis.pub.keys('helene:*')

    for (const key of keys) {
      await redis.pub.del(key)
    }
  })

  it('the server object should have the redis transport instantiated', async () => {
    expect(test1.server)
      .to.have.property('redisTransport')
      .that.is.instanceof(RedisTransport)

    expect(test2.server)
      .to.have.property('redisTransport')
      .that.is.instanceof(RedisTransport)
  })

  it('should publish and receive message', async () => {
    redis.publishNextTick('fake:channel', 'test')

    const data = await redis.wait('fake:channel')

    expect(data).to.have.property('channel').that.equals('fake:channel')
    expect(data).to.have.property('message').that.equals('test')
  })

  it('should add server id to redis', async () => {
    const { uuid } = test1.server

    let servers = await redis.pub.sMembers(`helene:servers`)

    expect(servers).to.include(uuid)
    expect(servers).to.include(test2.server.uuid)

    await test1.server.close()

    servers = await redis.pub.sMembers(`helene:servers`)

    expect(servers).to.not.include(uuid)
    expect(servers).to.include(test2.server.uuid)
  })

  it('should emit an event in one server and both clients should fire', async () => {
    await test1.createEvent('monkey:king')
    await test2.createEvent('monkey:king')

    test1.server.defer('monkey:king', 11)

    const data2 = await test2.client.wait('monkey:king')

    expect(data2).to.be.equal(11)
  })

  it('should get the online stats', async () => {
    test1.server.setAuth({
      logIn: () => {
        return { token: '1' }
      },
      auth: () => ({ user: { _id: 1 } }),
    })

    await test1.client.login({})

    const stats = await test1.client.call('online:stats')

    expect(stats).to.have.property('clients').that.equals(2)
  })

  it('should remove client from redis upon disconnecting', async () => {
    const { uuid } = test1.server

    let clients = await redis.pub.sMembers(`helene:clients:${uuid}`)

    expect(clients).to.deep.equals(
      Array.from(test1.server.allClients.values()).map(c => c._id),
    )

    await test1.client.close()

    // Make sure the server had time to remove the client from redis
    await test1.sleep(10)

    clients = await redis.pub.sMembers(`helene:clients:${uuid}`)

    expect(clients).to.deep.equals([])
  })

  it('should remove server key from redis', async () => {
    const { uuid } = test1.server

    let clients = await redis.pub.sMembers(`helene:clients:${uuid}`)

    expect(clients).to.deep.equals(
      Array.from(test1.server.allClients.values()).map(c => c._id),
    )

    await test1.server.close()

    clients = await redis.pub.sMembers(`helene:clients:${uuid}`)

    expect(clients).to.deep.equals([])
  })
})

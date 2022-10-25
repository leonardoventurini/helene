import { expect } from 'chai'
import { RedisTestUtil } from './utils/redis-test-util'
import { TestUtility } from './utils/test-utility'
import { RedisTransport } from '../server/transports/redis-transport'
import { ObjectId } from 'bson'
import { ServerEvents } from '../constants'

describe('Redis Pub/Sub', function () {
  const redis = new RedisTestUtil()
  const test1 = new TestUtility({ globalInstance: false, redis: true })
  const test2 = new TestUtility({ globalInstance: false, redis: true })

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
    expect(test1.server.redisTransport).to.be.instanceof(RedisTransport)

    const userId = new ObjectId()

    test1.server.setAuth({
      logIn: () => {
        return { token: '1' }
      },
      auth: () => ({ user: { _id: userId } }),
    })

    await test1.client.login({})

    await test1.client.isReady()

    test1.server.addEvent('test1')
    test1.server.addEvent('test2')
    test1.server.addEvent('test3')

    await test1.client.subscribe('test1')
    await test1.client.subscribe('test2')
    await test1.client.subscribe('test3')

    await test1.client.channel('test:channel').subscribe('test')

    let stats = await test1.server.getOnlineStats()

    expect(stats).to.have.property('clientCount').that.equals(2)
    expect(stats)
      .to.have.property('users')
      .that.deep.equals([userId.toString()])

    await test1.server.redisTransport.close()

    test1.server.redisTransport = undefined

    stats = await test1.server.getOnlineStats()

    expect(stats).to.have.property('clientCount').that.equals(1)
    expect(stats)
      .to.have.property('users')
      .that.deep.equals([userId.toString()])

    await test1.client.close()

    await test1.server.waitFor(ServerEvents.DISCONNECTION)
  })

  it('should only remove the user if no other clients with that same userId are connected', async () => {
    const userId = new ObjectId()
    const client1 = await test1.createClient()
    const client2 = await test1.createClient()

    test1.server.setAuth({
      logIn: () => {
        return { token: '1' }
      },
      auth: () => ({ user: { _id: userId } }),
    })

    await client1.login({})
    await client2.login({})

    await client1.isReady()
    await client2.isReady()

    const stats = await test1.server.getOnlineStats()

    expect(stats).to.have.property('clientCount').that.equals(4)
    expect(stats)
      .to.have.property('users')
      .that.deep.equals([userId.toString()])

    await client1.close()

    await test1.server.waitFor(ServerEvents.DISCONNECTION)

    const stats2 = await test1.server.getOnlineStats()

    expect(stats2).to.have.property('clientCount').that.equals(3)
    expect(stats2)
      .to.have.property('users')
      .that.deep.equals([userId.toString()])

    await client2.close()

    await test1.server.waitFor(ServerEvents.DISCONNECTION)

    const stats3 = await test1.server.getOnlineStats()

    expect(stats3).to.have.property('clientCount').that.equals(2)
    expect(stats3).to.have.property('users').that.deep.equals([])
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

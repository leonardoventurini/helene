import { expect } from 'chai'
import { TestUtility } from './utils/test-utility'
import { RedisTestUtil } from './tests/redis-test-util'
import { RedisTransport } from './server'

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
    redis.deferPublish('fake:channel', 'test')

    const data = await redis.wait('fake:channel')

    expect(data).to.have.property('channel').that.equals('fake:channel')
    expect(data).to.have.property('message').that.equals('test')
  })

  it('should emit an event in one server and both clients should fire', async () => {
    await test1.createEvent('monkey:king', undefined, { cluster: true })
    await test2.createEvent('monkey:king', undefined, { cluster: true })

    test1.server.defer('monkey:king', 11)

    const data2 = await test2.client.wait('monkey:king')

    expect(data2).to.be.equal(11)
  })

  it('should emit an event in one server and both clients should fire (server sent events)', async () => {
    console.log('before create http client')

    const client1 = await test1.createHttpClient()
    const client2 = await test2.createHttpClient()

    console.log('after create http client')

    expect(client1.clientHttp.clientEventSource.readyState).to.be.equal(1)
    expect(client2.clientHttp.clientEventSource.readyState).to.be.equal(1)

    expect(client1.clientSocket.socket).to.be.undefined
    expect(client2.clientSocket.socket).to.be.undefined

    test1.server.addEvent('monkey:king', { cluster: true })
    test2.server.addEvent('monkey:king', { cluster: true })

    await client1.subscribe('monkey:king')
    await client2.subscribe('monkey:king')

    test1.server.defer('monkey:king', 11)

    const [data1, data2] = await Promise.all([
      client1.wait('monkey:king'),
      client2.wait('monkey:king'),
    ])

    expect(data1).to.be.equal(11)
    expect(data2).to.be.equal(11)

    await client1.close()
    await client2.close()
  })

  it('should not propagate an event if it does not have the cluster flag', async () => {
    await test1.createEvent('monkey:king')
    await test2.createEvent('monkey:king')

    test1.server.defer('monkey:king', 11)

    const data1 = await test1.client.wait('monkey:king')
    const timeout = await test2.client.timeout('monkey:king')

    expect(data1).to.be.equal(11)
    expect(timeout).to.be.equal(true)
  })
})

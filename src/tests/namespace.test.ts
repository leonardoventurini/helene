import { expect } from 'chai'
import { TestUtility } from '../utils/test-utility'
import { DEFAULT_NAMESPACE } from '../constants'

describe('Namespace', function () {
  const test = new TestUtility()

  it('should have the default namespace and have the proper structure', async () => {
    const { namespaces } = test.server

    expect(namespaces).to.have.length(1)
    expect(namespaces).to.have.key(DEFAULT_NAMESPACE)

    const namespace = namespaces.get(DEFAULT_NAMESPACE)

    expect(namespace)
      .to.have.property('uuid')
      .that.is.a('string')
      .and.have.length(36)

    expect(namespace).to.have.property('methods').that.is.instanceof(Map)

    expect(namespace.methods).to.have.length.greaterThan(0)

    expect(namespace).to.have.property('clients').that.is.instanceof(Map)

    expect(namespace).to.have.property('channels').that.is.instanceof(Map)
  })

  it('should get a proper namespace object', async () => {
    const namespace = test.server.of('/chatroom')

    expect(namespace).to.be.an('object')
    expect(namespace.emit).to.be.a('function')
    expect(namespace.nsName).to.be.a('string')
  })

  it('should list namespaces', async () => {
    const ns = test.server.of('/chat1')

    ns.events.add('alert1')

    expect(ns.events.list).to.have.lengthOf(1)

    test.server.events.add('alert2', { ns: 'chat2' })

    expect(ns.events.list).to.have.lengthOf(1)

    expect(test.server.events.list).to.have.lengthOf(1)
  })

  it('should close a namespace', async function () {
    const ns = test.server.of('/chat1')

    ns.events.add('alert1')

    expect(ns.events.list).to.have.lengthOf(1)

    test.server.events.add('alert2', { ns: '/chat2' })

    expect(ns.events.list).to.have.lengthOf(1)

    test.server.removeNamespace('/chat1')

    expect(test.server.namespaces.get('/chat1')).to.be.undefined
  })

  it('should subscribe to an event', async () => {
    test.server.events.add('message::new')

    const client = await test.createClient()

    const data = await client.subscribe('message::new')

    expect(data).to.have.property('message::new').that.is.true

    await client.close()
  })

  it('should subscribe to multiple events', async () => {
    const client = await test.createClient()

    test.server.events.add('orderUpdate')

    const data = await client.subscribe(['newsUpdate', 'orderUpdate'])

    expect(data).to.have.property('newsUpdate')
    expect(data).to.have.property('orderUpdate')

    await client.close()
  })

  it('should receive an event from a joined namespace', async () => {
    const client = await test.createClient({ namespace: '/chat' })

    const chat = test.server.of('/chat')

    chat.events.add('chat::message')

    await client.subscribe('chat::message')

    chat.defer('chat::message', 'test')

    const data = await client.wait('chat::message')

    expect(data).to.equals('test')

    await client.close()
  })

  it('should receive params from an event correctly', async () => {
    const client = await test.createClient({ namespace: '/test' })

    const ns = test.server.of('/test')

    ns.events.add('test')

    await client.subscribe('test')

    ns.defer('test', ['aaaa', 'bbbb', 'cccc'])

    const data = await client.wait('test')

    expect(data).to.be.eql(['aaaa', 'bbbb', 'cccc'])
  })
})

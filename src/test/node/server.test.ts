import { HttpTransport, Server, WebSocketTransport } from '../../server'
import { ServerEvents } from '../../utils'
import { expect, describe, it } from 'vitest'
import { EJSON } from '../../ejson'
import { TestUtility } from '../test-utility'

describe('Server', () => {
  const test = new TestUtility()

  it('should have the correct structure', async () => {
    expect(test).to.have.property('server').that.is.instanceof(Server)

    const { server } = test

    expect(server)
      .to.have.property('uuid')
      .that.is.a('string')
      .and.have.length(36)

    expect(server).to.have.property('host').that.is.a('string')

    expect(server).to.have.property('port').that.is.a('number')

    expect(server)
      .to.have.property('httpTransport')
      .that.is.instanceof(HttpTransport)

    expect(server)
      .to.have.property('webSocketTransport')
      .that.is.instanceof(WebSocketTransport)

    expect(server).to.have.property('redisTransport').that.is.null
  })

  it('should return a new instance', async () => {
    const srv = await test.createRandomSrv({
      globalInstance: true,
    })

    expect(test.server).to.be.an.instanceOf(Server)

    expect(global)
      .to.have.property('Helene')
      .that.is.an('object')
      .and.is.instanceOf(Server)

    await srv.close()
  })

  it('should close the server and remove the global instance', async () => {
    const srv = await test.createRandomSrv({
      globalInstance: true,
    })

    expect(global).to.have.property('Helene').that.is.not.undefined

    await Helene.close()

    expect(global).to.not.have.property('Helene')

    await srv.close()
  })

  it('should throw an error when trying to create a second instance', async () => {
    await test.server.close()

    const srv = new Server({
      globalInstance: true,
      port: test.randomPort,
    })

    expect(
      () =>
        new Server({
          globalInstance: true,
          port: test.randomPort,
        }),
    ).to.throw('There can only be one instance of Helene.')

    await srv.close()
  })

  it('should create a server instance with a custom request listener', async () => {
    let requestBody = null

    await test.server.close()

    global.Helene = undefined

    const server = await test.createRandomSrv({
      requestListener(req, res) {
        req.on('data', buffer => {
          requestBody = EJSON.parse(buffer.toString())
        })
      },
    })

    server.addMethod('test', () => true)

    const client = await test.createClient({ port: server.port })

    const result = await client.call('test', null, { http: true })

    expect(result).to.be.true

    expect(requestBody)
      .to.have.property('payload')
      .which.is.an('object')
      .with.property('method')
      .that.equals('test')

    await client.close()
    await server.close()
  })

  it('should delete client nodes on disconnect by close', async () => {
    const server = await test.createRandomSrv({ globalInstance: false })

    server.addEvent('test')

    const client = await test.createClient({ port: server.port })

    server.channel('test:channel')

    await client.channel('test:channel').subscribe('test')

    expect(server.allClients.size).to.equal(1)

    expect(server.channel('test:channel').clients.get('test').size).to.equal(1)

    let nodeEmittedDisconnect = false

    const [node] = server.channel('test:channel').clients.get('test')

    node.once(ServerEvents.DISCONNECT, () => {
      nodeEmittedDisconnect = true
    })

    client.close().catch(console.error)

    await server.waitFor(ServerEvents.DISCONNECTION)

    expect(nodeEmittedDisconnect).to.be.true

    expect(server.clients.size).to.equal(0)

    expect(server.channel('test:channel').clients.get('test').size).to.equal(0)
  })

  it('should send meta data to the server', async () => {
    const server = await test.createRandomSrv({ globalInstance: false })

    const client = await test.createClient({
      port: server.port,
      meta: { test: true },
    })

    expect(
      Array.from(server.allClients.values()).map(({ uuid }) => uuid),
    ).to.be.deep.equal([client.uuid])

    const node = server.allClients.get(client.uuid)

    expect(node.meta).to.deep.equal({
      test: true,
    })

    expect(node.remoteAddress).to.be.a('string').and.not.be.empty
  })

  it('should create and call method using proxy syntax', async () => {
    test.server.m.test.proxy = async num => num * 2

    const result = await test.client.m.test.proxy(4, {
      http: true,
    })

    expect(result).to.equal(8)
  })
})

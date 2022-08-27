import { expect } from 'chai'
import { TestUtility } from '../utils/test-utility'
import { Server } from '../server/server'
import { HttpTransport } from '../server/transports/http-transport'
import { WebSocketTransport } from '../server/transports/websocket-transport'
import { EJSON } from 'ejson2'

describe('Server', function () {
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

    expect(server).to.have.property('namespaces').that.is.instanceof(Map)
  })

  it('should return a new instance', async () => {
    expect(test.server).to.be.an.instanceOf(Server)

    expect(global)
      .to.have.property('Helene')
      .that.is.an('object')
      .and.is.instanceOf(Server)
  })

  it('should close the server and remove the global instance', async () => {
    expect(global).to.have.property('Helene').that.is.not.undefined

    await Helene.close()

    expect(global).to.not.have.property('Helene')
  })

  it('should throw an error when trying to create a second instance', function () {
    expect(() => new Server()).to.throw(
      'There can only be one instance of Helene.',
    )
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

    server.register('test', () => true)

    const client = await test.createClient({ port: server.port })

    const result = await client.call('test', null, { http: true })

    expect(result).to.be.true

    expect(requestBody)
      .to.have.property('payload')
      .which.is.an('object')
      .with.property('method')
      .that.equals('test')

    await server.close()
  })
})

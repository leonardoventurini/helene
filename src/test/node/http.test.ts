import { expect, describe, it, beforeEach } from 'vitest'
import { TestUtility } from '../test-utility'
import path from 'path'
import request from 'supertest'
import defer from 'lodash/defer'
import range from 'lodash/range'
import sinon from 'sinon'
import { ClientEvents, Errors, ServerEvents } from '../../utils'
import { Client, ClientHttp } from '../../client'
import { ClientNode } from '../../server'

describe('HTTP', async () => {
  const test = new TestUtility()

  beforeEach(async () => {
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
  })

  it('should call an rpc method through http and get the right result', async () => {
    let capture = null

    test.server.addMethod<number[], number>('sum', async function ([a, b, c]) {
      capture = this.req?.path

      return a + b + c
    })

    const result = await test.client.call('sum', [7, 7, 7], { http: true })

    expect(capture).to.equal('/__h')

    expect(result).to.be.equals(21)
  })

  it('should call a protected rpc method and fail authentication using http', async () => {
    await test.client.setContextAndReInit({})

    test.server.addMethod(
      'protected:method',
      async () => {
        return true
      },
      { protected: true },
    )

    const error = await test.catchError(
      test.client.call('protected:method', null, { http: true }),
    )

    expect(error)
      .to.have.property('message')
      .that.is.equal(Errors.METHOD_FORBIDDEN)

    expect(error).to.have.property('message').that.is.equal('Method Forbidden')
  })

  it('should call a protected method and pass authentication using http', async () => {
    test.server.addMethod(
      'protected:method',
      async function () {
        expect(this).to.have.property('isAuthenticated').that.is.true
        expect(this)
          .to.have.property('context')
          .that.containSubset({ token: 'test', user: { _id: 'id' } })
        expect(this).to.have.property('userId').that.is.equal('id')
        return true
      },
      { protected: true },
    )

    await test.client.setContextAndReInit({ token: 'test' })

    const result = await test.client.call('protected:method', null, {
      http: true,
    })

    expect(result).to.be.true
  })

  it('should fail when exceeding rate limit', async () => {
    const server = await test.createRandomSrv({ globalInstance: false })

    const client = await test.createClient({ port: server.port })

    server.addMethod('test:method', v => v)

    const call = async () => {
      for (const v of range(1, 200)) {
        await client.call('test:method', v, { http: true })
      }
    }

    await expect(call()).rejects.toThrow(/429/)
  })

  describe('client.href()', () => {
    it('should return the correct uri', () => {
      const href = test.client.href('test')

      expect(href).to.equal(
        `http://${test.client.options.host}:${test.client.options.port}/test`,
      )
    })
  })

  describe('express static', () => {
    beforeEach(() => {
      test.server.static(path.join(__dirname, './static'), true)
    })

    it('sends index.html', async () => {
      const response = await request(test.server.express).get('/')

      expect(response.header['content-type']).to.match(/html/)
      expect(response.status).to.equal(200)
      expect(response.text).to.match(/Hello World/)
    })

    it('sends fallback index.html', async () => {
      const response = await request(test.server.express).get('/user/')

      expect(response.header['content-type']).to.match(/html/)
      expect(response.status).to.equal(200)
      expect(response.text).to.match(/Hello World/)
    })

    it('sends alternate page', async () => {
      const response = await request(test.server.express).get('/foo.html')

      expect(response.header['content-type']).to.match(/html/)
      expect(response.status).to.equal(200)
      expect(response.text).to.match(/Foo Fighting/)
    })
  })

  describe('server sent events', () => {
    it('should send an event through the current client node', async () => {
      const client = await test.createHttpClient()

      test.server.addMethod('send:event', async function () {
        this.sendEvent('event', { hello: 'world' })
      })

      client.call('send:event')

      const [payload] = await client.waitFor('event', 200)

      expect(payload).to.be.an('object')
      expect(payload).to.have.property('hello').that.is.equal('world')
    }, 20000)

    it('should subscribe to an event', async () => {
      test.server.addEvent('test:event')

      const client = await test.createHttpClient()

      const subscribeResponse = await client.subscribe('test:event')

      expect(subscribeResponse).to.be.deep.equal({
        'test:event': true,
      })

      test.server.addMethod('send:event', async function () {
        this.server.emit('test:event', true)
      })

      client.call('send:event')

      const [payload] = await client.waitFor('test:event', 200)

      expect(payload).to.be.true
    })

    it('should send an event to a channel', async () => {
      test.server.addEvent('test:event')

      const client = await test.createHttpClient()

      const channel = client.channel('test:channel')

      const subscribeResponse = await channel.subscribe('test:event')

      expect(subscribeResponse).to.be.deep.equal({
        'test:event': true,
      })

      test.server.addMethod('send:event', async function () {
        this.server.channel('test:channel').emit('test:event', true)
      })

      client.call('send:event')

      const [payload] = await channel.waitFor('test:event', 200)

      expect(payload).to.be.true
    })

    it('should try to subscribe to a protected event while unauthenticated and fail', async () => {
      const client = await test.createHttpClient()

      test.server.addEvent('protected:event', { protected: true })

      const result = await client.subscribe('protected:event')

      expect(result).to.have.property('protected:event').that.is.false

      test.server.defer('protected:event')

      const eventTimeout = await test.client.timeout('protected:event')

      expect(eventTimeout).to.be.true
    })

    it('should call connection and disconnection events', async () => {
      const clientPromise = test.createHttpClient()

      const [node1] = await test.server.waitFor(ServerEvents.CONNECTION, 1000)
      expect(node1).to.be.instanceof(ClientNode)

      await clientPromise

      defer(() => {
        node1.req.destroy()
      })

      const [node2] = await test.server.waitFor(
        ServerEvents.DISCONNECTION,
        5000,
      )

      expect(node2).to.be.instanceof(ClientNode)
    }, 20000)

    it('should not call event source creation if auto connect is enabled (default)', async () => {
      const stub = sinon.stub(ClientHttp.prototype, 'createEventSource')

      const client = new Client({
        host: test.host,
        port: test.port,
      })

      await client.isConnected()

      expect(stub.called).to.be.false

      await client.close()

      stub.restore()
    })

    it('should call init even after it abnormally reconnects', async () => {
      const client = await test.createHttpClient()

      test.server.httpTransport.eventSourceClients.get(client.uuid).res.end()

      await client.waitFor(ClientEvents.EVENTSOURCE_ERROR)

      await client.waitFor(ClientEvents.INITIALIZED)
    })
  })
})

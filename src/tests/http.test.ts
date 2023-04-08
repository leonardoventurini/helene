import { expect } from 'chai'
import { Errors } from '../utils'
import { TestUtility } from './utils/test-utility'
import path from 'path'
import request from 'supertest'
import { range } from 'lodash'

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

    test.server.addMethod('sum', async function ([a, b, c]) {
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

    await expect(call()).to.be.rejectedWith(/429/)
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
      test.server.static(path.join(__dirname, '../../test/static'), true)
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
})

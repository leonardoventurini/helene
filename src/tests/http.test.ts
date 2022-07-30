import { expect } from 'chai'
import { Errors } from '../errors'
import { TestUtility } from '../utils/test-utility'
import path from 'path'
import request from 'supertest'

describe('HTTP', async () => {
  const test = new TestUtility()

  beforeEach(async () => {
    test.server.setAuth({
      auth(context: any) {
        return context?.token ? context : false
      },
      async logIn({ email, password }) {
        if (email === 'test@helene.test' && password === '123456') {
          return {
            token: 1,
          }
        }
      },
    })
  })

  it('should call an rpc method through http and get the right result', async () => {
    let capture = null

    test.server.register('sum', async function ([a, b, c]) {
      capture = this.req?.path

      return a + b + c
    })

    const result = await test.client.call('sum', [7, 7, 7], { http: true })

    expect(capture).to.equal('/__h/')

    expect(result).to.be.equals(21)
  })

  it('should call a protected rpc method and fail authentication using http', async () => {
    await test.client.setContext({})

    test.server.register(
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
    test.server.register(
      'protected:method',
      async function () {
        expect(this).to.have.property('isAuthenticated').that.is.true

        expect(this).to.have.property('context').that.eql({ token: 1 })

        return true
      },
      { protected: true },
    )

    await test.client.setContext({ token: 1 })

    const result = await test.client.call('protected:method', null, {
      http: true,
    })

    expect(result).to.be.true
  })

  describe('client.href()', () => {
    it('should return the correct uri', () => {
      const href = test.client.href('test')

      expect(href).to.equal(
        `http://${test.client.host}:${test.client.port}/test`,
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

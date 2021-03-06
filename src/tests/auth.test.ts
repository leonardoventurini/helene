import { expect } from 'chai'
import { TestUtility } from '../utils/test-utility'
import { Errors } from '../errors'

describe('Auth', async () => {
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

  it('should fully authenticate into a protected server', async () => {
    expect(test.server.isAuthEnabled).to.be.true

    test.server.register(
      'protected:method',
      async () => {
        return true
      },
      { protected: true },
    )

    await test.client.login({ email: 'test@helene.test', password: '123456' })

    const result = await test.client.call('protected:method')

    expect(result).to.be.true
  })

  it('should call a protected rpc method and fail authentication', async () => {
    test.server.register(
      'protected:method',
      async () => {
        return true
      },
      { protected: true },
    )

    const error = await test.catchError(test.client.call('protected:method'))

    expect(error)
      .to.have.property('message')
      .that.is.equal(Errors.METHOD_FORBIDDEN)

    expect(error).to.have.property('message').that.is.equal('Method Forbidden')
  })

  it('should call a protected method and pass authentication', async () => {
    test.server.register(
      'protected:method',
      async () => {
        return true
      },
      { protected: true },
    )

    await test.client.setContext({ token: 1 })

    const result = await test.client.call('protected:method')

    expect(result).to.be.true
  })
})

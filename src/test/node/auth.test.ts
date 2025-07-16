import { TestUtility } from '../test-utility'
import { Errors } from '../../utils'
import { expect } from 'chai'

describe('Auth', async () => {
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

  it('should fully authenticate into a protected server', async () => {
    expect(test.server.isAuthEnabled).to.be.true

    test.server.addMethod(
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
    test.server.addMethod(
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
    test.server.addMethod(
      'protected:method',
      async () => {
        return true
      },
      { protected: true },
    )

    await test.client.setContextAndReInit({ token: 'test' })

    const result = await test.client.call('protected:method')

    expect(result).to.be.true
  })

  it('should allow subscription only to the channel of the user', async () => {
    test.server.addEvent('protected:event', {
      user: true,
    })

    const result = await test.client.subscribe('protected:event')

    expect(result).to.have.property('protected:event').that.is.false

    await test.client.login({
      email: 'test@helene.test',
      password: '123456',
    })

    const result2 = await test.client.channel('id').subscribe('protected:event')

    expect(result2).to.have.property('protected:event').that.is.true

    test.server.defer('protected:event', true)

    const eventTimeout = await test.client.timeout('protected:event')

    expect(eventTimeout).to.be.true
  })
})

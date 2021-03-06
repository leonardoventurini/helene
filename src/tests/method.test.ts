import { expect } from 'chai'
import { TestUtility } from '../utils/test-utility'
import { Errors, PublicError } from '../errors'
import { Presentation } from '../server/presentation'
import { ClientNode } from '../server/client-node'
import { Observable } from 'rxjs'
import { HeleneAsyncLocalStorage } from '../server/helene-async-local-storage'

describe('Methods', function () {
  const test = new TestUtility()

  it('should register a method, call it and get a response', async () => {
    test.server.register('test:method', function ({ a, b }) {
      return a + b
    })

    const result = await test.client.call('test:method', { a: 1, b: 2 })

    expect(result).to.equal(3)
    expect(test.client.queue.items).to.have.length(0)
    expect(test.client.queue.isEmpty).to.be.true
  })

  it('should register a method as a promise and still get a response', async () => {
    test.server.register('test:promise', async ([a, b, c]) => {
      return a + b + c
    })

    const result = await test.client.call('test:promise', [1, 2, 3])

    expect(result).to.equal(6)
  })

  it('should throw an error', async () => {
    test.server.register('test:error', () => {
      throw new Error('Lorem Ipsum')
    })

    const error = await test.catchError(test.client.call('test:error'))

    expect(error)
      .to.have.property('type')
      .that.equals(Presentation.PayloadType.ERROR)

    expect(error).to.have.property('message').that.equals(Errors.INTERNAL_ERROR)

    expect(error).to.have.property('stack').that.is.a('string')
  })

  /**
   * @unstable
   */
  it('should make a void method call', async () => {
    let called = false

    test.server.register('test:method', () => {
      called = true
    })

    await test.client.void('test:method')

    await test.sleep(0)

    expect(called).to.be.true
  })

  it('should run middleware', async () => {
    let calledMiddleware = false

    test.server.register('test:method:middleware', function () {}, {
      middleware: [
        function () {
          calledMiddleware = true
          expect(this).to.be.instanceof(ClientNode)
        },
      ],
    })

    await test.client.void('test:method:middleware')

    await test.sleep(0)

    expect(calledMiddleware).to.be.true
  })

  it('should run middleware and throw error', async () => {
    test.server.register('test:method:middleware:reject', () => {}, {
      middleware: [
        function () {
          throw new PublicError('Authentication Failed')
        },
      ],
    })

    await expect(
      test.client.call('test:method:middleware:reject'),
    ).to.be.rejectedWith('Authentication Failed')
  })

  it('should return an observable', done => {
    test.server.register('rxjs:method', () => 42)

    const call$ = test.client.rCall('rxjs:method')

    expect(call$).to.be.instanceOf(Observable)

    call$.subscribe(value => {
      expect(value).to.equal(42)
      done()
    })
  })

  it('should register and call a method with schema validation', async () => {
    test.server.register(
      'validated:method',
      ({ knownProperty }) => Boolean(knownProperty),
      {
        schema: {
          type: 'object',
          properties: {
            knownProperty: { type: 'boolean' },
          },
          required: ['knownProperty'],
          additionalProperties: false,
        },
      },
    )

    await expect(test.client.call('validated:method')).to.be.rejectedWith(
      Errors.INVALID_PARAMS,
    )

    const result = await test.client.call('validated:method', {
      knownProperty: true,
    })

    expect(result).to.be.true
  })

  it('should have async local storage', async () => {
    test.server.register('get:async:ls', function () {
      return HeleneAsyncLocalStorage.getStore()
    })

    test.server.register('get:async:ls:this', function () {
      return this.storage
    })

    const result1 = await test.client.call('get:async:ls')
    const result2 = await test.client.call('get:async:ls:this')

    expect(result1).to.have.property('executionId').that.is.a('string')
    expect(result2).to.have.property('executionId').that.is.a('string')
    expect(result1).to.have.property('context').that.is.an('object')
    expect(result2).to.have.property('context').that.is.an('object')
  })
})

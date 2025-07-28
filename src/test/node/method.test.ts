import { expect, describe, it } from 'vitest'

import { Client } from '../../client'
import { ClientNode, HeleneAsyncLocalStorage, ns } from '../../server'
import {
  Errors,
  getPromise,
  PayloadType,
  PublicError,
  ServerEvents,
  sleep,
} from '../../utils'
import range from 'lodash/range'
import sinon from 'sinon'
import * as yup from 'yup'
import { z } from 'zod'
import { TestUtility } from '../test-utility'

describe('Methods', () => {
  const test = new TestUtility()

  it('should register a method, call it and get a response', async () => {
    test.server.addMethod('test:method', function ({ a, b }) {
      return a + b
    })

    const result = await test.client.call('test:method', { a: 1, b: 2 })

    expect(result).toEqual(3)
    expect(test.client.queue.items).toHaveLength(0)
    expect(test.client.queue.isEmpty).toBe(true)
  })

  it('should register a method as a promise and still get a response', async () => {
    test.server.addMethod('test:promise', async ([a, b, c]) => {
      return a + b + c
    })

    const result = await test.client.call('test:promise', [1, 2, 3])

    expect(result).toEqual(6)
  })

  it('should throw an error', async () => {
    test.server.addMethod('test:error', () => {
      throw new Error('Lorem Ipsum')
    })

    const error = await test.catchError(test.client.call('test:error'))

    expect(error).toHaveProperty('type')
    expect(error.type).toEqual(PayloadType.ERROR)

    expect(error).toHaveProperty('message')
    expect(error.message).toEqual(Errors.INTERNAL_ERROR)
  })

  it('should make a void method call', async () => {
    let called = false

    test.server.addMethod('test:method', () => {
      called = true
    })

    await test.client.void('test:method')

    await test.sleep(500)

    expect(called).toBe(true)
  })

  it('should run middleware', async () => {
    let calledMiddleware = false
    let params: any

    const { promise, resolve } = getPromise()

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    test.server.addMethod(
      'test:method:middleware',
      function (_params) {
        params = _params
        resolve()
      },
      {
        middleware: [
          function () {
            calledMiddleware = true
            expect(this).toBeInstanceOf(ClientNode)

            return { hello: true }
          },
        ],
      },
    )

    await test.client.void('test:method:middleware', { world: true })

    await promise

    expect(calledMiddleware).toBe(true)
    expect(params).to.containSubset({
      hello: true,
      world: true,
    })
  })

  it('should run middleware which return the latest in the chain primitives', async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    test.server.addMethod(
      'test:method:middleware',
      function (params) {
        return params
      },
      {
        middleware: [
          function () {
            return 'tea'
          },
          function () {
            return 'world'
          },
        ],
      },
    )

    const result = await test.client.call('test:method:middleware', 'hello')

    expect(result).toEqual('world')
  })

  it('should run middleware and throw error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    test.server.addMethod('test:method:middleware:reject', () => {}, {
      middleware: [
        function () {
          throw new PublicError('Authentication Failed')
        },
      ],
    })

    await expect(
      test.client.call('test:method:middleware:reject'),
    ).rejects.toThrow('Authentication Failed')
  })

  it('should register and call a method with schema validation', async () => {
    test.server.addMethod(
      'validated:method',
      ({ knownProperty }) => Boolean(knownProperty),
      {
        schema: yup.object({
          knownProperty: yup.boolean().required(),
        }),
      },
    )

    await expect(test.client.call('validated:method')).rejects.toThrow(
      Errors.INVALID_PARAMS,
    )

    const result = await test.client.call('validated:method', {
      knownProperty: true,
    })

    expect(result).toBe(true)
  })

  it('should register and call a method with zod schema validation', async () => {
    const { server } = await test.createRandomSrv({ globalInstance: true })
    const { client } = await test.createClient({ port: server.port })

    server.addMethod(
      'validated:zod:method',
      ({ knownProperty }) => Boolean(knownProperty),
      {
        schema: z.object({
          knownProperty: z.boolean(),
        }),
      },
    )

    const submodule3 = ns()
      .add('foo3', () => true)
      .build()

    const submodule1 = ns()
      .add('foo1', () => true)
      .add('submodule3', submodule3)
      .build()

    const submodule2 = ns()
      .add('validated:zod:method2', ({ knownProperty }) => knownProperty, {
        schema: z.object({
          knownProperty: z.boolean(),
        }),
      })
      .add('hello', () => 'world')
      .add('submodule1', submodule1)
      .register()

    const c = client.typed(submodule2)

    c.m['validated:zod:method2']({ knownProperty: true })

    const res1 = await c.m.submodule1.foo1()

    expect(res1).toBe(true)

    const res2 = await c.m.hello()

    expect(res2).toEqual('world')

    const res3 = await c.call('validated:zod:method2', {
      knownProperty: true,
    })

    expect(res3).toBe(true)

    const res4 = await c.m.submodule1.submodule3.foo3()

    expect(res4).toBe(true)

    await expect(client.call('validated:zod:method')).rejects.toThrow(
      Errors.INVALID_PARAMS,
    )

    const result = await client.call('validated:zod:method', {
      knownProperty: true,
    })

    expect(result).toBe(true)

    await client.close()
    await server.close()
  })

  it('should have async local storage', async () => {
    test.server.addMethod('get:async:ls', function () {
      return HeleneAsyncLocalStorage.getStore()
    })

    const result1 = await test.client.call('get:async:ls')

    expect(result1).toHaveProperty('executionId')
    expect(result1.executionId).toBeTypeOf('string')
    expect(result1).toHaveProperty('context')
    expect(result1.context).toBeTypeOf('object')
  })

  it('should have async local storage in middleware', async () => {
    test.server.addMethod(
      'get:async:ls',
      function (store) {
        return store
      },
      {
        middleware: [
          async function () {
            return HeleneAsyncLocalStorage.getStore()
          },
        ],
      },
    )

    const result1 = await test.client.call('get:async:ls')

    expect(result1).toHaveProperty('executionId')
    expect(result1.executionId).toBeTypeOf('string')
    expect(result1).toHaveProperty('context')
    expect(result1.context).toBeTypeOf('object')
  })

  it('should call a method in the server', async () => {
    let isServer = false

    test.server.addMethod('test:method', function ({ a, b }) {
      isServer = this.isServer

      return a + b
    })

    const result = await test.server.call('test:method', { a: 1, b: 2 })

    expect(result).toEqual(3)
    expect(isServer).toBe(true)
  })

  it('should throw when exceeding rate limit', async () => {
    const server = await test.createRandomSrv({ globalInstance: false })

    const client = await test.createClient({ port: server.port })

    server.addMethod('test:method', v => v)

    const call = async () => {
      for (const v of range(1, 200)) {
        await client.call('test:method', v)
      }
    }

    await expect(call()).rejects.toThrow(Errors.RATE_LIMIT_EXCEEDED)
  })

  it('in case we return undefined in a method we should ', async () => {
    const client = await test.createClient({
      port: test.server.port,
    })

    test.server.addMethod('test:method', async () => undefined)

    const result = await client.call('test:method')

    expect(result).toEqual(undefined)
  })

  it('should fire an event after a method call', async () => {
    test.server.addMethod('test:method', async () => {
      await sleep(100)

      return 42
    })

    test.client.call('test:method', { a: 1, b: 2 })

    const [result] = await test.server.waitFor(ServerEvents.METHOD_EXECUTION)

    expect(result).toBeTypeOf('object')
    expect(result.method).toEqual('test:method')
    expect(result.time).toBeGreaterThanOrEqual(90)
    expect(result.time).toBeLessThanOrEqual(110)
    expect(result.params).toEqual({ a: 1, b: 2 })
    expect(result.result).toEqual(42)
  })

  it('should only call a method if the client has initialized', async () => {
    const calls = []

    test.server.addMethod('test:method', async param => {
      calls.push(param)
      return 42
    })

    const stub = sinon.stub(Client.prototype, 'initialize')
    stub.returns(Promise.resolve(true))

    try {
      const client = new Client({
        host: test.server.host,
        port: test.server.port,
      })

      await expect(
        client.call('test:method', 1, { timeout: 1500 }),
      ).rejects.toThrow(/Helene: Client not initialized/)

      expect(calls).toEqual([])

      stub.restore()

      setTimeout(() => client.initialize(), 100)

      await client.call('test:method', 1)

      expect(calls).toEqual([1])

      await client.close()
    } finally {
      stub.restore()
    }
  })

  it('should retry failed method calls according to retry options', async () => {
    const calls = []
    let shouldFail = true

    test.server.addMethod('test:method', async param => {
      calls.push(param)
      if (shouldFail) {
        shouldFail = false
        throw new Error('Temporary failure')
      }
      return 42
    })

    const result = await test.client.call('test:method', 1, {
      maxRetries: 2,
      delayBetweenRetriesMs: 100,
    })

    expect(calls).toEqual([1, 1])
    expect(result).toEqual(42)
  })

  it('should throw after exhausting all retry attempts', async () => {
    test.server.addMethod('test:method', async () => {
      throw new Error('Persistent failure')
    })

    await expect(
      test.client.call('test:method', 1, {
        maxRetries: 3,
        delayBetweenRetriesMs: 100,
      }),
    ).rejects.toThrow(Errors.INTERNAL_ERROR)
  })
})

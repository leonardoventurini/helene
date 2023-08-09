// @ts-ignore
import React from 'react'
import { expect } from 'chai'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import { TestUtility } from './utils/test-utility'
import {
  useAuth,
  useCombinedDebounce,
  useConnectionState,
  useEvent,
  useLocalEvent,
  useMethod,
  useMultipleRawEventsObservable,
  useObject,
  useObserverSubscribe,
  useRawEventObservable,
  useRemoteEvent,
} from '../react'
import sinon from 'sinon'
import { omit } from 'lodash'
import { EventEmitter2 } from 'eventemitter2'
import { sleep } from '../utils'

describe('React Hooks', () => {
  const test = new TestUtility()

  it('renders hello world', () => {
    render(<span role='message'>Hello World</span>)

    expect(screen.queryByRole('message').textContent).to.equal('Hello World')
  })

  describe('useAuth', () => {
    beforeEach(() => {
      test.server.setAuth({
        async logIn({ email, password }) {
          if (email === '123' && password === '123') {
            return {
              token: 'foo',
            }
          }
        },
        async auth({ token }) {
          return token ? { user: { _id: '456' } } : undefined
        },
      })
    })

    it('should return the auth state', async () => {
      const { wrapper } = test

      const { result } = renderHook(() => useAuth(), { wrapper })

      expect(result.current).to.containSubset({
        authenticated: false,
        context: {},
      })

      await test.client.login({ email: '123', password: '123' })

      await sleep(100)

      expect(omit(result.current, 'client')).to.containSubset({
        authenticated: true,
        context: {
          token: 'foo',
          initialized: true,
        },
      })
    })
  })

  describe('useConnectionState', () => {
    it('should return the connection state', async () => {
      const { wrapper } = test

      const { result } = renderHook(() => useConnectionState(), { wrapper })

      await waitFor(() => {
        expect(result.current).to.be.deep.equal({
          isOnline: true,
          isOffline: false,
          isConnecting: false,
        })
      })

      await test.client.close()

      await waitFor(() => {
        expect(result.current).to.be.deep.equal({
          isOnline: false,
          isOffline: true,
          isConnecting: false,
        })
      })

      await test.client.connect()

      await waitFor(() => {
        expect(result.current).to.be.deep.equal({
          isOnline: true,
          isOffline: false,
          isConnecting: false,
        })
      })
    })

    it('should show the connection state when the client is connecting', async () => {
      const { wrapper } = test

      const { result } = renderHook(() => useConnectionState(), { wrapper })

      await test.client.close()

      // The updates are debounced at 100ms
      await sleep(110)

      expect(result.current).to.be.deep.equal({
        isOnline: false,
        isOffline: true,
        isConnecting: false,
      })

      await test.client.connect()

      await test.client.isConnected()

      await sleep(110)

      expect(result.current).to.be.deep.equal({
        isOnline: true,
        isOffline: false,
        isConnecting: false,
      })
    })
  })

  describe('useMethod', () => {
    it('should call the method', async () => {
      test.server.addMethod('echo', value => value)

      const { wrapper } = test

      const { result } = renderHook(
        () => useMethod({ method: 'echo', params: 'test' }),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current).to.containSubset({
          result: 'test',
          loading: false,
        })
      })
    })

    it('should refresh method', async () => {
      let count = 0

      test.server.addMethod('count', () => ++count)

      const { wrapper } = test

      const { result } = renderHook(() => useMethod({ method: 'count' }), {
        wrapper,
      })

      await waitFor(() => {
        expect(omit(result.current, 'client')).to.containSubset({
          result: 1,
          loading: false,
        })
      })

      test.server.refresh('count')

      await waitFor(() => {
        expect(omit(result.current, 'client')).to.containSubset({
          result: 2,
          loading: false,
        })
      })
    })

    it('should call the method using http', async () => {
      let count = 0
      let socket

      test.server.addMethod('count', async function () {
        socket = this.socket

        return ++count
      })

      const { wrapper } = test

      expect(socket).to.be.undefined

      const { result } = renderHook(
        () => useMethod({ method: 'count', http: true }),
        {
          wrapper,
        },
      )

      await waitFor(() => {
        expect(omit(result.current, 'client')).to.containSubset({
          result: 1,
          loading: false,
        })
      })

      expect(socket).to.be.null
    })
  })

  describe('useEvent', () => {
    it('should subscribe', async () => {
      test.server.addEvent('set:value')

      let value = 0

      await test.client.isConnected()

      const unsub = sinon.fake.returns(Promise.resolve())

      test.client.channel().unsubscribe = unsub

      const { wrapper } = test

      const { result, rerender } = renderHook(
        ({ event }: any) =>
          useRemoteEvent(
            { event },
            val => {
              value = val
            },
            [value],
          ),
        { wrapper, initialProps: { event: 'set:value' } },
      )

      expect(test.client._events)
        .to.have.property('set:value')
        .that.is.a('function')

      await waitFor(() => {
        expect(result.current).to.equal(true)
      })

      test.server.defer('set:value', 42)

      await waitFor(() => {
        expect(value).to.equal(42)
      })

      expect(unsub.called).to.be.false

      test.server.addEvent('another:event')

      rerender({ event: 'another:event' })

      expect(unsub.called).to.be.true

      unsub.resetHistory()

      await waitFor(() => {
        expect(result.current).to.equal(true)
      })

      test.server.defer('another:event', 'hello')

      await waitFor(() => {
        expect(value).to.equal('hello')
      })
    })

    it('should listen to multiple events and only unsubscribe after all listeners are removed', async () => {
      test.server.addEvent('random:event')

      const { wrapper } = test

      const hook1 = renderHook(
        ({ event }: any) => useRemoteEvent({ event }, () => {}, []),
        { wrapper, initialProps: { event: 'random:event' } },
      )

      const hook2 = renderHook(
        ({ event }: any) => useRemoteEvent({ event }, () => {}, []),
        { wrapper, initialProps: { event: 'random:event' } },
      )

      await sleep(100)

      hook1.unmount()

      await sleep(100)

      expect(test.client.events).to.include('random:event')

      hook2.unmount()

      await sleep(100)

      expect(test.client.events).to.not.include('random:event')
    })

    it('should use local event', async () => {
      const values = []

      await test.client.isConnected()

      const { wrapper } = test

      const { result, rerender } = renderHook(
        ({ event }: any) =>
          useLocalEvent(
            { event },
            val => {
              values.push(val)
            },
            [values],
          ),
        { wrapper, initialProps: { event: 'set:value' } },
      )

      rerender({ event: 'another:event' })
      rerender({ event: 'set:value' })

      // Only one callback should be ever registered for the same event used as a hook.
      expect(test.client._events)
        .to.have.property('set:value')
        .that.is.a('function')

      await waitFor(() => {
        expect(result.current).to.equal(true)
      })

      test.client.emit('set:value', 42)

      await waitFor(() => {
        expect(values).to.be.deep.equal([42])
      })
    })
  })

  describe('useCombinedDebounce', () => {
    it('should fire event after debounce', async () => {
      const values = []

      const emitter1 = new EventEmitter2()
      const emitter2 = new EventEmitter2()

      await test.client.isConnected()

      const { wrapper } = test

      renderHook(
        ({ event }: any) => {
          const $event1 = useRawEventObservable(emitter1, 'test')
          const $event2 = useRawEventObservable(emitter2, 'test')

          useCombinedDebounce({
            observables: [$event1, $event2],
            debounce: 100,
            callback() {
              values.push(42)
            },
          })
        },
        { wrapper, initialProps: { event: 'set:value' } },
      )

      emitter1.emit('test', 42)
      emitter2.emit('test', 42)

      await sleep(200)

      emitter2.emit('test', 42)
      emitter2.emit('test', 42)
      emitter2.emit('test', 42)

      await waitFor(() => {
        expect(values).to.be.deep.equal([42, 42])
      })
    })
  })

  describe('useMultipleRawEventsObservable', () => {
    it('should listen to multiple events', async () => {
      const values = []

      const emitter = new EventEmitter2()

      await test.client.isConnected()

      const { wrapper } = test

      const { result } = renderHook(
        () => {
          const observable = useMultipleRawEventsObservable(emitter, [
            'test1',
            'test2',
            'test3',
          ])

          return useObserverSubscribe(
            observable,
            val => {
              values.push(val)
            },
            [values],
          )
        },
        { wrapper },
      )

      await waitFor(() => expect(result.current).to.not.be.undefined)

      emitter.emit('test1', 42)
      emitter.emit('test2', 42)
      emitter.emit('test3', 42)

      await waitFor(() => {
        expect(values).to.be.deep.equal([42, 42, 42])
      })
    })
  })

  describe('useObject', () => {
    it('should keep the same reference', async () => {
      const { wrapper } = test

      const { result, rerender } = renderHook(
        ({ c }) => {
          return useObject({
            a: 1,
            b: 2,
            c,
          })
        },

        // @ts-ignore
        { wrapper, initialProps: { c: 3 } },
      )

      const capture1 = result.current

      rerender({ c: 3 })
      rerender({ c: 3 })
      rerender({ c: 3 })

      const capture2 = result.current

      await waitFor(() => {
        expect(capture1).to.equal(capture2)
      })

      rerender({ c: 4 })

      const capture3 = result.current

      await waitFor(() => {
        expect(capture1).to.not.equal(capture3)
      })
    })

    it('should keep the same reference with child objects', async () => {
      const { wrapper } = test

      const { result, rerender } = renderHook(
        ({ c }) => {
          return useObject({
            a: 1,
            b: 2,
            c,
          })
        },

        // @ts-ignore
        { wrapper, initialProps: { c: { d: 1 } } },
      )

      const capture1 = result.current

      rerender({ c: { d: 1 } })
      rerender({ c: { d: 1 } })
      rerender({ c: { d: 1 } })

      const capture2 = result.current

      await waitFor(() => {
        expect(capture1).to.equal(capture2)
      })

      rerender({ c: { d: 2 } })

      const capture3 = result.current

      await waitFor(() => {
        expect(capture3).to.not.equal(capture1)
      })
    })

    it('should keep the same reference with child array', async () => {
      const { wrapper } = test

      const { result, rerender } = renderHook(
        ({ c }) => {
          return useObject({
            a: 1,
            b: 2,
            c,
          })
        },

        // @ts-ignore
        { wrapper, initialProps: { c: [1, 2, 3] } },
      )

      const capture1 = result.current

      rerender({ c: [1, 2, 3] })
      rerender({ c: [1, 2, 3] })
      rerender({ c: [1, 2, 3] })

      const capture2 = result.current

      await waitFor(() => {
        expect(capture1).to.equal(capture2)
      })

      rerender({ c: [1, 2] })

      const capture3 = result.current

      await waitFor(() => {
        expect(capture1).to.not.equal(capture3)
      })
    })
  })
})

import React from 'react'
import { expect } from 'chai'
import { render, screen, waitFor } from '@testing-library/react'
import { renderHook } from '@testing-library/react-hooks'
import { TestUtility } from '../utils/test-utility'
import { useConnectionState, useEvent, useMethod } from '../react/hooks'
import sinon from 'sinon'

describe('React Hooks', () => {
  const test = new TestUtility()

  it('renders hello world', () => {
    render(<span role='message'>Hello World</span>)

    expect(screen.queryByRole('message').textContent).to.equal('Hello World')
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

      test.client.connect().catch(console.error)

      await waitFor(() => {
        expect(result.current).to.be.deep.equal({
          isOnline: false,
          isOffline: true,
          isConnecting: true,
        })
      })

      await test.client.isReady()

      await waitFor(() => {
        expect(result.current).to.be.deep.equal({
          isOnline: true,
          isOffline: false,
          isConnecting: false,
        })
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
        expect(result.current).to.containSubset({
          result: 1,
          loading: false,
        })
      })

      test.server.refresh('count')

      await waitFor(() => {
        expect(result.current).to.containSubset({
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
        expect(result.current).to.containSubset({
          result: 1,
          loading: false,
        })
      })

      expect(socket).to.be.null
    })
  })

  it('useEvent', async () => {
    test.server.addEvent('set:value')

    let value = 0

    await test.client.isReady()

    const unsub = sinon.fake.returns(Promise.resolve())

    test.client.channel().unsubscribe = unsub

    const { wrapper } = test

    const { result, rerender } = renderHook(
      ({ event }: any) =>
        useEvent(
          { event, subscribe: true },
          val => {
            value = val
          },
          [value],
        ),
      { wrapper, initialProps: { event: 'set:value' } },
    )

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
})

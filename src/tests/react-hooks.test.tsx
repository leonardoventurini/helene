import React from 'react'
import { expect } from 'chai'
import { render, screen, waitFor } from '@testing-library/react'
import { renderHook } from '@testing-library/react-hooks'
import { TestUtility } from '../utils/test-utility'
import { useEvent, useMethod } from '../react/hooks'
import sinon from 'sinon'

describe('React Hooks', () => {
  const test = new TestUtility()

  it('renders hello world', () => {
    render(<span role='message'>Hello World</span>)

    expect(screen.queryByRole('message').textContent).to.equal('Hello World')
  })

  it('useMethod', async () => {
    test.server.register('echo', value => value)

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

  it('useEvent', async () => {
    test.server.events.add('set:value')

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

    test.server.events.add('another:event')

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

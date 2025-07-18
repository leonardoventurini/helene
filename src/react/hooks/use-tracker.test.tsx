import { expect, describe, it } from 'vitest'
import { useTracker } from './use-tracker'
import { TestUtility } from '../../test/test-utility'
import { renderHook } from '@testing-library/react'
import { ClientProvider } from '../components'
import React from 'react'
import { sleep } from '../../utils'
import { createCollection } from '../../data'

describe('useTracker', () => {
  const test = new TestUtility()

  const wrapper = function wrapper({ children }) {
    return (
      <ClientProvider clientInstance={test.client}>{children}</ClientProvider>
    )
  }

  it('should throw error if collections is empty', () => {
    expect(() => {
      renderHook(() => useTracker(() => Promise.resolve(null), []), { wrapper })
    }).to.throw('collection deps is required')

    expect(() => {
      // @ts-ignore
      renderHook(() => useTracker(() => Promise.resolve(null), [{}]), {
        wrapper,
      })
    }).to.not.throw('collection deps is required')
  })

  it('should return data', async () => {
    const collection = await createCollection({ name: 'test' })
    const data = { _id: 1, test: 'test' }
    await collection.insert(data)

    const { result } = renderHook(
      () => useTracker(async () => collection.find(), [collection]),
      { wrapper },
    )

    expect(result.current).to.be.null

    await sleep(100)

    expect(result.current).to.deep.equal([data])

    await collection.remove(data)

    await sleep(100)

    expect(result.current).to.deep.equal([])
  })
})

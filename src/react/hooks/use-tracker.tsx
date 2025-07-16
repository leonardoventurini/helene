import { useEffect, useState } from 'react'
import { Collection, CollectionEvent } from '@helenejs/data'
import isEmpty from 'lodash/isEmpty'
import { throttle } from 'lodash'

export function useTracker<T = any>(
  func: () => Promise<T>,
  collections: Collection[],
  deps: any[] = [],
): T {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (isEmpty(collections)) {
      throw new Error('collection deps is required')
    }

    const onUpdated = throttle(
      () => {
        func().then(setData).catch(console.error)
      },
      20,
      {
        leading: true,
        trailing: true,
      },
    )

    onUpdated()

    for (const collection of collections) {
      collection.on(CollectionEvent.READY, onUpdated)
      collection.on(CollectionEvent.UPDATED, onUpdated)
    }

    return () => {
      for (const collection of collections) {
        collection.off(CollectionEvent.READY, onUpdated)
        collection.off(CollectionEvent.UPDATED, onUpdated)
      }
    }
  }, [...collections, ...deps])

  return data
}

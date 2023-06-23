import { useEffect, useState } from 'react'
import { Collection, CollectionEvent } from '../../data'
import { useObject } from './use-object'

export function useCount(collection: Collection, filter: Record<string, any>) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!collection) return

    async function onUpdated() {
      const result = await collection.count(filter)

      setData(result)
    }

    onUpdated().catch(console.error)

    collection.on(CollectionEvent.READY, onUpdated)
    collection.on(CollectionEvent.UPDATED, onUpdated)

    return () => {
      collection.off(CollectionEvent.READY, onUpdated)
      collection.off(CollectionEvent.UPDATED, onUpdated)
    }
  }, [collection, useObject(filter)])

  return data
}

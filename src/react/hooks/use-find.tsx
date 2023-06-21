import { useEffect, useState } from 'react'
import { Collection, CollectionEvent } from '../../data'

export type FindHookOptions = {
  collection: Collection
  filter?: Record<string, any>
  sort?: Record<string, 1 | -1>
  projection?: Record<string, 0 | 1>
  limit?: number
  skip?: number
}

export function useFind({
  collection,
  filter,
  sort,
  projection,
  limit,
  skip,
}: FindHookOptions) {
  const [data, setData] = useState([])

  useEffect(() => {
    if (!collection) return

    async function onUpdated() {
      setData(
        await collection
          .find(filter, projection)
          .sort(sort)
          .limit(limit)
          .skip(skip),
      )
    }

    onUpdated().catch(console.error)

    collection.on(CollectionEvent.READY, onUpdated)
    collection.on(CollectionEvent.UPDATED, onUpdated)

    return () => {
      collection.off(CollectionEvent.READY, onUpdated)
      collection.off(CollectionEvent.UPDATED, onUpdated)
    }
  }, [
    collection,
    JSON.stringify(filter),
    JSON.stringify(projection),
    JSON.stringify(sort),
  ])

  return data
}

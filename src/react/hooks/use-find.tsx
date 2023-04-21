import { useEffect, useState } from 'react'
import { Collection, CollectionEvent } from '../../data'

type Options = {
  collection: Collection
  filter?: Record<string, any>
  sort?: Record<string, 1 | -1>
  projection?: Record<string, 0 | 1>
}

export function useFind({ collection, filter, sort, projection }: Options) {
  const [data, setData] = useState([])

  useEffect(() => {
    if (!collection) return

    async function onUpdated() {
      setData(await collection.find(filter, projection).sort(sort))
    }

    onUpdated().catch(console.error)

    collection.on([CollectionEvent.UPDATED, CollectionEvent.READY], onUpdated)

    return () => {
      collection.off(
        [CollectionEvent.UPDATED, CollectionEvent.READY],
        onUpdated,
      )
    }
  }, [
    collection,
    JSON.stringify(filter),
    JSON.stringify(projection),
    JSON.stringify(sort),
  ])

  return data
}

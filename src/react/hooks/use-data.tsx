import useAsyncEffect from 'ahooks/lib/useAsyncEffect'
import useCreation from 'ahooks/lib/useCreation'
import useDebounceFn from 'ahooks/lib/useDebounceFn'
import { useClient, useCollection, useRemoteEvent } from './index'
import { useState } from 'react'
import isEmpty from 'lodash/isEmpty'
import set from 'lodash/set'
import { BrowserStorage } from '../../data/browser'
import { useFind } from './use-find'
import { ClientEvents, HeleneEvents } from '../../utils'
import { useThrottledEvents } from './use-throttled-events'

const browserStorage = new BrowserStorage()

type Props = {
  method: string
  channel?: string
  params?: any
  filter?: Record<string, any>
  sort?: Record<string, 1 | -1>
  projection?: Record<string, 0 | 1>
  selectiveSync?: boolean
  authenticated?: boolean
  collectionName?: string
}

export function useData({
  method,
  channel,
  params,
  filter,
  sort,
  projection,
  selectiveSync = false,
  authenticated = false,
  collectionName = null,
}: Props) {
  const name = useCreation(
    () => collectionName ?? `collection:${method}`,
    [method, collectionName],
  )

  const collection = useCollection({
    name,
    storage: browserStorage,
    timestamps: true,
    autoload: true,
  })

  const [loading, setLoading] = useState(true)

  const client = useClient()

  const result: any = useCreation(() => ({}), [])

  const data = useFind(collection, filter, sort, projection)

  const refresh = useDebounceFn(
    async () => {
      if (!collection) return
      if (authenticated && !client.authenticated) {
        setLoading(false)
        return
      }

      const count = await collection.count({})

      setLoading(true)

      let response

      if (count && selectiveSync) {
        const [{ updatedAt: lastUpdatedAt = null } = {}] = (await collection
          .find({})
          .projection({ updatedAt: 1 })
          .sort({ updatedAt: -1 })) ?? [{}]

        response = await client.call(method, { ...params, lastUpdatedAt })

        for (const datum of Array.isArray(response) ? response : [response]) {
          if (await collection.findOne({ _id: datum._id })) {
            await collection.remove({ _id: datum._id })
          }
        }
      } else {
        response = await client.call(method, params)

        await collection.remove({}, { multi: true })
      }

      if (response) {
        await collection.insert(response)
      }

      setLoading(false)
    },
    { wait: 100, leading: false, trailing: true },
  )

  useAsyncEffect(async () => {
    set(window, `collections.${method}`, collection)

    await refresh.run()
  }, [collection])

  useThrottledEvents(
    client,
    [ClientEvents.INITIALIZED, ClientEvents.CONTEXT_CHANGED],
    refresh.run,
    [refresh.run],
    500,
  )

  useRemoteEvent(
    {
      event: HeleneEvents.METHOD_REFRESH,
      channel,
    },
    (refreshMethod: string) => {
      if (refreshMethod === method) refresh.run()
    },
    [refresh.run],
  )

  result.collection = collection
  result.data = data
  result.loading = isEmpty(data) && loading
  result.client = client
  result.refresh = refresh.run

  return result
}

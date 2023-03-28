import { useAsyncEffect, useCreation, useDebounceFn } from 'ahooks'
import {
  useClient,
  useCombinedThrottle,
  useRawEventObservable,
  useRemoteEvent,
} from './index'
import { useCallback, useState } from 'react'
import { set } from 'lodash'
import { v5 as uuidv5 } from 'uuid'
import { BrowserStorage } from '../../data/browser'
import { useFind } from './use-find'
import { ClientEvents, HeleneEvents } from '../../utils'

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
}: Props) {
  const [collection, setCollection] = useState(null)
  const [loading, setLoading] = useState(true)

  const client = useClient()

  const result: any = useCreation(() => ({}), [])

  const data = useFind({
    collection,
    filter,
    sort,
    projection,
  })

  const refresh = useDebounceFn(
    async () => {
      if (!collection) return
      if (!client.ready) return
      if (authenticated && !client.authenticated) {
        setLoading(false)
        return
      }

      const count = await collection.count({})

      if (!data.length) {
        setLoading(true)
      }

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
    const collection = await client.createCollection({
      name: `collection:${uuidv5(method, uuidv5.URL)}`,
      storage: browserStorage,
      timestamps: true,
      autoload: true,
    })

    set(window, `collections.${method}`, collection)

    setCollection(collection)

    await refresh.run()
  }, [method])

  const initialized$ = useRawEventObservable(client, ClientEvents.INITIALIZED)
  const contextChanged$ = useRawEventObservable(
    client,
    ClientEvents.CONTEXT_CHANGED,
  )

  useCombinedThrottle({
    observables: [initialized$, contextChanged$],
    throttle: 500,
    callback: useCallback(() => {
      refresh.run()
    }, [refresh.run]),
  })

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
  result.loading = loading
  result.client = client
  result.refresh = refresh.run

  return result
}

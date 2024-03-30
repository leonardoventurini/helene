import useCreation from 'ahooks/lib/useCreation'
import useDebounceFn from 'ahooks/lib/useDebounceFn'
import { useEffect, useState } from 'react'
import isEmpty from 'lodash/isEmpty'
import set from 'lodash/set'
import { ClientEvents, HeleneEvents } from '@helenejs/utils'
import { BrowserStorage } from '@helenejs/data/lib/browser'
import { BaseDocument, Collection } from '@helenejs/data'
import { useClient } from './use-client'
import { useFind } from './use-find'
import { useObject } from './use-object'
import { useThrottledEvents } from './use-throttled-events'
import { useRemoteEvent } from './use-event'

const browserStorage = new BrowserStorage()

type Props = {
  method: string
  channel?: string
  params?: any

  /**
   * Scope the data to a specific filter.
   */
  filter?: Record<string, any>
  sort?: Record<string, 1 | -1>
  projection?: Record<string, 0 | 1>
  selectiveSync?: boolean
  authenticated?: boolean
  collectionName?: string
  collection?: Collection
  single?: boolean
}

export function useData({
  method,
  channel,
  params,
  filter = {},
  sort,
  projection,
  selectiveSync = false,
  authenticated = false,
  collectionName = null,
  collection = null,
  single = false,
}: Props) {
  const name = useCreation(
    () => collection?.name ?? collectionName ?? `collection:${method}`,
    [method, collectionName],
  )

  const innerCollection = useCreation(
    () =>
      collection ??
      new Collection({
        name,
        storage: browserStorage,
        timestamps: true,
        autoload: true,
      }),
    [name, collection],
  )

  const [loading, setLoading] = useState(() => true)

  const client = useClient()

  const result: any = useCreation(() => ({}), [])

  const data = useFind(innerCollection, filter, sort, projection)

  const refresh = useDebounceFn(
    async () => {
      if (!innerCollection) return
      if (authenticated && !client.authenticated) {
        setLoading(false)
        return
      }

      setLoading(true)

      const count = await innerCollection.count({})

      try {
        let response: BaseDocument | BaseDocument[]

        /**
         * @todo Create method utility that checks if ids are still present in the collection to sync deletions.
         */
        if (count && selectiveSync) {
          const [{ updatedAt: lastUpdatedAt = null } = {}] =
            (await innerCollection
              .find(filter)
              .projection({ updatedAt: 1 })
              .sort({ updatedAt: -1 })) ?? [{}]

          response = await client.call(method, { ...params, lastUpdatedAt })

          for (const datum of Array.isArray(response) ? response : [response]) {
            if (
              await innerCollection.findOne({
                ...filter,
                _id: datum._id,
              })
            ) {
              await innerCollection.remove({
                ...filter,
                _id: datum._id,
              })
            }
          }
        } else {
          response = await client.call(method, params)
        }

        if (response) {
          const existingIds = (
            await innerCollection.find(filter).projection({ _id: 1 })
          ).map((datum: BaseDocument) => datum._id)

          if (!Array.isArray(response)) {
            response = [response]
          }

          const retrievedIds = response.map((datum: BaseDocument) => datum._id)

          for (const datum of response as BaseDocument[]) {
            if (existingIds.includes(datum._id)) {
              const existing = await innerCollection.findOne({ _id: datum._id })

              const removedFields = Object.keys(existing).filter(
                key => !(key in datum),
              )

              await innerCollection.update(
                { ...filter, _id: datum._id },
                {
                  $set: datum,
                  $unset: removedFields.reduce((acc, key) => {
                    acc[key] = ''
                    return acc
                  }, {}),
                },
              )
            } else {
              await innerCollection.insert(datum)
            }
          }

          for (const id of existingIds) {
            if (!retrievedIds.includes(id)) {
              await innerCollection.remove({ ...filter, _id: id })
            }
          }
        }
      } catch (error) {
        await innerCollection.remove(filter, { multi: true })
        console.error(error)
      }

      setLoading(false)
    },
    { wait: 100, leading: false, trailing: true },
  )

  useEffect(() => {
    set(window, `collections.${innerCollection.name}`, innerCollection)
    setLoading(true)
    refresh.run()
  }, [innerCollection, useObject(filter), useObject(params)])

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

  result.collection = innerCollection
  result.data = single ? data[0] : data
  result.loading = isEmpty(data) && loading
  result.client = client
  result.refresh = refresh.run

  return result
}

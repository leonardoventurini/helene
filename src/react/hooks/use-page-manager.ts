import { useEffect, useMemo, useState } from 'react'
import { PageManager } from '../../utils'
import { useClient } from './use-client'
import debounce from 'lodash/debounce'
import { EJSON } from 'ejson2'

export function usePageManager({
  method,
  event,
  channel,
  terms = {},
  step = 100,
  sort = {},
}) {
  const client = useClient()
  const [isLoading, setLoading] = useState(true)
  const [data, setData] = useState([])
  const [isSorting, setSorting] = useState(false)

  const pageManager = useMemo(
    () =>
      client
        ? new PageManager({
            client,
            method,
            event,
            channel,
            step,
            terms,
          })
        : null,
    [step, client, EJSON.stringify(terms)],
  )

  const loadMore = useMemo(
    () =>
      debounce(async ({ startIndex = 0, stopIndex = step - 1 } = {}) => {
        const startMs = Date.now()

        console.log('Loading More', startIndex, stopIndex, pageManager?.size)

        if (!pageManager?.size) return

        setLoading(true)

        await pageManager.loadIncrementally(startIndex, stopIndex)

        setLoading(false)

        console.log(`Subscribed in ${Date.now() - startMs}ms`)
      }, 100),
    [pageManager, step],
  )

  const updateDataCallback = useMemo(
    () =>
      async (callback = null) => {
        setData(await pageManager.getDocuments())
        callback?.()
      },
    [pageManager],
  )

  useEffect(() => {
    if (!pageManager) return

    pageManager.on('update:data', updateDataCallback)

    return () => {
      pageManager?.off('update:data', updateDataCallback)
    }
  }, [pageManager, updateDataCallback])

  useEffect(() => {
    if (!pageManager) return

    if (EJSON.stringify(pageManager.sort) !== EJSON.stringify(sort)) {
      setSorting(true)
      pageManager.setSort(sort)
    }
  }, [pageManager, sort, updateDataCallback])

  return {
    data,
    loadMore,
    isLoading,
    isSorting,
    totalCount: pageManager?.totalCount ?? 0,
    refresh() {
      pageManager
        .reload()
        .then(() => {
          updateDataCallback()
        })
        .catch(console.error)
    },
  }
}

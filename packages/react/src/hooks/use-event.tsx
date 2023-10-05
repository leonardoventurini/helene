import { useCallback, useEffect } from 'react'
import { useSubscribe } from './use-subscribe'
import { useClient } from './use-client'
import useCreation from 'ahooks/lib/useCreation'
import isString from 'lodash/isString'
import { NO_CHANNEL } from '@helenejs/utils'

export type UseEventParams = {
  event: string
  channel?: string
  active?: boolean
}

export function useLocalEvent(
  { event, channel = NO_CHANNEL }: UseEventParams,
  fn: (...args: any[]) => void,
  deps: any[] = [],
) {
  const _callback = useCallback(fn, deps)

  const client = useClient()

  const ch = useCreation(() => {
    return channel && isString(channel) ? client.channel(channel) : client
  }, [channel])

  useEffect(() => {
    if (!channel) return

    ch.on(event, _callback)

    return () => {
      ch.off(event, _callback)
    }
  }, [event, channel, _callback])
}
export function useRemoteEvent(
  { event, channel = NO_CHANNEL, active = true }: UseEventParams,
  fn: (...args: any[]) => void,
  deps: any[] = [],
) {
  return useSubscribe(
    {
      event,
      channel,
      active,
    },
    fn,
    deps,
  )
}

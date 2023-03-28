import { useCallback, useEffect, useState } from 'react'
import { NO_CHANNEL } from '../../utils'
import { useSubscribe } from './use-subscribe'
import { useClient } from './use-client'
import { useCreation } from 'ahooks'
import { EMPTY } from 'rxjs'
import { isString } from 'lodash'
import { fromEventThrottled } from '../utils'

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
  const [ready, setReady] = useState(false)
  const _callback = useCallback(fn, deps)

  const client = useClient()

  const _channel = useCreation(() => {
    return channel && isString(channel) ? client.channel(channel) : client
  }, [channel])

  const event$ = useCreation(() => {
    return _channel ? fromEventThrottled(_channel, event) : EMPTY
  }, [event, _channel])

  useEffect(() => {
    const _sub = event$.subscribe(_callback)
    setReady(true)

    return () => {
      _sub.unsubscribe()
      setReady(false)
    }
  }, [event$])

  return ready
}
export function useRemoteEvent(
  { event, channel = NO_CHANNEL, active = true }: UseEventParams,
  fn: (...args: any[]) => void,
  deps: any[] = [],
) {
  const refreshCallback = useCallback(fn, deps)

  return useSubscribe({
    event,
    channel,
    setup: useCallback(
      ch => {
        ch.on(event, refreshCallback)
      },
      [event, refreshCallback],
    ),
    teardown: useCallback(
      ch => {
        ch.off(event, refreshCallback)
      },
      [event, refreshCallback],
    ),
    deps: [refreshCallback],
    active,
  })
}

export function useEvent(
  { event, channel = NO_CHANNEL }: UseEventParams,
  fn: (...args: any[]) => void,
  deps: any[] = [],
) {
  return useLocalEvent({ event, channel }, fn, deps)
}

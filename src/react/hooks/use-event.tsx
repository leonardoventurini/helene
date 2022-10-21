import { useCallback } from 'react'
import { NO_CHANNEL } from '../../constants'
import { useSubscribe } from './use-subscribe'

export type UseEventParams = {
  event: string
  channel?: string
  subscribe?: boolean
  active?: boolean
}

export function useEvent(
  {
    event,
    channel = NO_CHANNEL,
    subscribe = false,
    active = true,
  }: UseEventParams,
  fn: (...args: any[]) => void,
  deps: any[] = [],
) {
  const refreshCallback = useCallback(fn, deps)

  return useSubscribe({
    event,
    channel,
    setup(ch) {
      ch.on(event, refreshCallback)
    },
    teardown(ch) {
      ch.off(event, refreshCallback)
    },
    subscribe,
    deps: [refreshCallback],
  })
}

import { NO_CHANNEL } from '../../utils/constants'
import { useChannel } from './use-channel'
import { EMPTY, fromEvent } from 'rxjs'
import { useSubscribe } from './use-subscribe'
import { useMemo } from 'react'

export function useEventObservable(
  event: string,
  channel: string = NO_CHANNEL,
  subscribe = false,
) {
  useSubscribe({
    event,
    channel,
    subscribe,
  })

  const ch = useChannel(channel)

  return useMemo(() => (ch ? fromEvent(ch, event) : EMPTY), [ch, event])
}

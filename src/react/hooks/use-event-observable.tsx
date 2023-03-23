import { NO_CHANNEL } from '../../utils'
import { useChannel } from './use-channel'
import { EMPTY, fromEvent } from 'rxjs'
import { useSubscribe } from './use-subscribe'
import { useCreation } from 'ahooks'

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

  return useRawEventObservable(ch, event)
}

export function useRawEventObservable(emitter: any, event: string) {
  return useCreation(
    () => (emitter ? fromEvent(emitter, event) : EMPTY),
    [emitter, event],
  )
}

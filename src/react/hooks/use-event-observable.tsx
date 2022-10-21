import { NO_CHANNEL } from '../../constants'
import { useChannel } from './use-channel'
import { fromEvent } from 'rxjs'
import { useSubscribe } from './use-subscribe'

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

  return fromEvent(ch, event)
}

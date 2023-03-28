import { EMPTY } from 'rxjs'
import { useCreation } from 'ahooks'
import { useChannel } from './use-channel'
import { useSubscribe } from './use-subscribe'
import { NO_CHANNEL } from '../../utils'
import { fromEvent, fromEvents } from '../utils'

export function useRawEventObservable(emitter: any, event: string) {
  return useCreation(
    () => (emitter ? fromEvent(emitter, event) : EMPTY),
    [emitter, event],
  )
}

export function useLocalEventObservable(
  event: string,
  channel: string = NO_CHANNEL,
) {
  const _channel = useChannel(channel)

  return useRawEventObservable(_channel, event)
}

export function useRemoteEventObservable(
  event: string,
  channel: string = NO_CHANNEL,
) {
  useSubscribe({ event, channel })

  const _channel = useChannel(channel)

  return useRawEventObservable(_channel, event)
}

export function useMultipleRawEventsObservable(target: any, events: string[]) {
  return useCreation(() => {
    return fromEvents(target, events)
  }, [target, JSON.stringify(events)])
}

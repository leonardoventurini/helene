import { EventEmitter2 } from 'eventemitter2'
import useCreation from 'ahooks/lib/useCreation'
import { useEffect } from 'react'
import { ThrottleOptions } from 'ahooks/lib/useThrottle/throttleOptions'
import { onAllThrottled } from '@helenejs/core/dist/utils/events'

export function useThrottledEvents(
  emitter: EventEmitter2,
  events: string[],
  callback: (...args: any[]) => void,
  deps: any[] = [],
  throttleMs = 1000,
  throttleOptions?: ThrottleOptions,
) {
  const _events = useCreation(() => events, events)
  const _callback = useCreation(() => callback, deps)

  useEffect(() => {
    return onAllThrottled(
      emitter,
      _events,
      _callback,
      throttleMs,
      throttleOptions,
    )
  }, [emitter, _events, _callback, throttleMs])
}

import { fromEvent, merge, throttleTime } from 'rxjs'
import { EventEmitter2 } from 'eventemitter2'

const SAFE_INTERVAL = 1000 / 60

export function fromEventThrottled(target: EventEmitter2, event: string) {
  return fromEvent(target, event).pipe(
    // Always needs to update the state on the trailing edge for updated values
    throttleTime(SAFE_INTERVAL, undefined, { trailing: true }),
  )
}

export function mergeThrottle<T>(...args: Parameters<typeof merge>) {
  return merge(...args).pipe(
    // Always needs to update the state on the trailing edge for updated values
    throttleTime(SAFE_INTERVAL, undefined, { trailing: true }),
  )
}

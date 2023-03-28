import { EMPTY, merge, Observable, throttleTime } from 'rxjs'
import { EventEmitter2 } from 'eventemitter2'
import { isEmpty } from 'lodash'

const SAFE_INTERVAL = 1000 / 60

export function fromEvent(target, event: string) {
  if (!target) {
    return EMPTY
  }

  return new Observable(observer => {
    const listener = value => {
      observer.next(value)
    }

    target.on(event, listener)

    return () => {
      target.off(event, listener)
    }
  })
}

export function fromEvents(target, events: string[]) {
  return !isEmpty(events) || !target
    ? merge(...events.map(event => fromEvent(target, event)))
    : EMPTY
}

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

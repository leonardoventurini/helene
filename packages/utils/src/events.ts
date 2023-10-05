import { EventEmitter2 } from 'eventemitter2'
import throttle from 'lodash/throttle'
import { ThrottleOptions } from 'ahooks/lib/useThrottle/throttleOptions'

export const onceAll = async (emitter: EventEmitter2, events: string[]) => {
  const promises = events.map(
    event =>
      new Promise<void>(resolve => {
        emitter.once(event, () => {
          resolve()
        })
      }),
  )
  await Promise.all(promises)
}

export const waitForAll = async (
  emitter: EventEmitter2,
  events: string[],
  timeout = 30000,
) => {
  await Promise.all(events.map(event => emitter.waitFor(event, timeout)))
}

export const onAllThrottled = (
  emitter: EventEmitter2,
  events: string[],
  callback: (...args: any[]) => void,
  throttleMs = 1000,
  throttleOptions?: ThrottleOptions,
) => {
  const throttled = throttle(callback, throttleMs, throttleOptions)

  events.forEach(event => emitter.on(event, throttled))

  /**
   * Cleanup function
   */
  return () => {
    events.forEach(event => emitter.off(event, throttled))
  }
}

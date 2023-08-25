import { EventEmitter2 } from 'eventemitter2'

export function createIterator(emitter: EventEmitter2, event: string) {
  let done = false

  return {
    [Symbol.asyncIterator]() {
      return this
    },
    next() {
      return new Promise((resolve, reject) => {
        if (done) {
          resolve({ done: true })
          return
        }

        const eventListener = (value: unknown) => {
          emitter.off(event, eventListener)
          resolve({ value, done: false })
        }

        emitter.on(event, eventListener)
      })
    },
    return() {
      done = true
      return { done: true }
    },
    throw(error: unknown) {
      done = true
      return Promise.reject(error)
    },
  }
}

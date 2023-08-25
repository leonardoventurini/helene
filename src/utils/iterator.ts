import { EventEmitter2 } from 'eventemitter2'

export function createIterator(emitter: EventEmitter2, event: string) {
  let done = false

  return {
    [Symbol.asyncIterator]() {
      return this
    },
    next() {
      return new Promise(resolve => {
        if (done) {
          resolve({ done: true })
          return
        }

        emitter.once(event, (value: unknown) => {
          resolve({ value, done: false })
        })
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

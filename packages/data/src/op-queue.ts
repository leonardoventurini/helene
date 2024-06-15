const operations: (() => Promise<void>)[] = []

let running = false

setInterval(async () => {
  if (operations.length === 0) return
  if (running) return

  const operation = operations.shift()

  running = true
  await operation()
  running = false
}, 1000 / 30)

export function queueOperation<T>(callback: () => Promise<T>): Promise<T> {
  let resolve: (value: T | PromiseLike<T>) => void
  let reject: (reason?: any) => void

  const wait = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  operations.push(async () => {
    try {
      resolve(await callback())
    } catch (error) {
      reject(error)
    }
  })

  return wait
}

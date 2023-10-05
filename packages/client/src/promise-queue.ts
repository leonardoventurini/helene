export type PromiseCallback = ConstructorParameters<typeof Promise>[0]

export type Resolve = Parameters<PromiseCallback>[0]
export type Reject = Parameters<PromiseCallback>[1]

export type QueueItem = {
  method: string
  resolve: Resolve
  reject: Reject
  timeoutId: NodeJS.Timeout
}

export type QueueMap = Map<string, QueueItem>

export class PromiseQueue {
  items: QueueMap = new Map()

  get length() {
    return this.items.size
  }

  get isEmpty() {
    return this.items.size === 0
  }

  enqueue(key: string, item: QueueItem) {
    this.items.set(key, item)
  }

  dequeue(key: string) {
    const item = this.items.get(key)
    this.items.delete(key)
    return item
  }
}

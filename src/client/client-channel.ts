import { EventEmitter2 } from 'eventemitter2'
import { Client } from './client'
import { isEmpty, isString } from 'lodash'
import { Helpers } from '../utils/helpers'
import { Methods } from '../server/methods'

export class ClientChannel extends EventEmitter2 {
  client: Client
  name: string
  events: Set<string> = new Set()

  constructor(name: string) {
    super()

    if (!isString(name) || !name)
      throw new Error('the channel name needs to be a string')

    this.name = name

    this.setMaxListeners(1000)
  }

  setClient(client: Client) {
    this.client = client
  }

  async subscribe(event: string | string[]) {
    this.client.debugger('Subscribing to', this.name, event)

    const channel = this.name
    const events = Helpers.ensureArray(event)

    if (isEmpty(events)) return {}

    const result = await this.client.call(Methods.RPC_ON, { events, channel })

    Object.entries(result).forEach(([event, result]) => {
      if (result) this.events.add(event)
    })

    return result
  }

  async unsubscribe(event: string | string[]) {
    this.client.debugger('Unsubscribing from', this.name, event)

    if (!event) return

    const channel = this.name
    const events = Helpers.ensureArray(event)

    if (isEmpty(events)) return {}

    const result = await this.client.call(Methods.RPC_OFF, { events, channel })

    Object.entries(result).forEach(([event, result]) => {
      if (result) this.events.delete(event)
    })

    return result
  }

  async resubscribe() {
    this.client.debugger('Resubscribing to:', this.name, this.events)
    await this.subscribe(Array.from(this.events))
  }

  /**
   * Wait for an event to fire asynchronously.
   *
   * Returns true if no params are sent.
   */
  wait(event: string, callback?: (...data: any) => any): Promise<any | any[]> {
    return new Promise(resolve => {
      this.once(event, function (data = true) {
        if (callback) {
          resolve(callback(data))
        } else {
          resolve(data)
        }
      })
    })
  }

  /**
   * Returns true if the event was not fired within a given timeout.
   */
  timeout(event: string, timeoutMs = 50) {
    return new Promise(resolve => {
      const timeout = setTimeout(() => resolve(true), timeoutMs)

      this.wait(event).then(res => {
        if (timeout) {
          clearTimeout(timeout)
        }
        resolve(false)
      })
    })
  }
}

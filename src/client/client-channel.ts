import { EventEmitter2 } from 'eventemitter2'
import { Client } from './client'
import { castArray, isEmpty, isString } from 'lodash'
import { AnyFunction, Methods } from '../utils'

export class ClientChannel extends EventEmitter2 {
  client: Client
  name: string
  events: Set<string> = new Set()

  // Built-in from EventEmitter2
  _events?: Record<string, AnyFunction[]>

  constructor(name: string) {
    super()

    if (!isString(name) || !name)
      throw new Error('the channel name needs to be a string')

    this.name = name

    this.setMaxListeners(128)
  }

  setClient(client: Client) {
    this.client = client
  }

  async subscribe(event: string | string[]) {
    const channel = this.name
    const events = castArray(event)

    if (isEmpty(events)) return {}

    // We need to store them even if they fail as we want to resubscribe to them when the connection type changes.
    for (const event of events) {
      this.events.add(event)
    }

    const result = await this.client.call(Methods.RPC_ON, { events, channel })

    console.log('subscription', this.name, result)

    return result
  }

  async unsubscribe(event: string | string[]) {
    const channel = this.name
    const events = castArray(event)

    if (isEmpty(events)) return {}

    for (const event of events) {
      this.events.delete(event)
    }

    const result = await this.client.call(Methods.RPC_OFF, { events, channel })

    console.log('unsubscription', this.name, result)

    return result
  }

  async resubscribe() {
    return this.subscribe(Array.from(this.events))
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

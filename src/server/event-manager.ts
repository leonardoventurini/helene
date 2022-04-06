import { Event, EventOptions } from './event'
import { ServerChannel } from './server-channel'
import { ClientNode } from './client-node'
import { Presentation } from './presentation'

export class EventManager {
  serverChannel: ServerChannel
  events: Map<string, Event> = new Map()

  constructor(serverChannel: ServerChannel) {
    this.serverChannel = serverChannel
  }

  get list() {
    return Array.from(this.events.keys())
  }

  get length() {
    return this.events.size
  }

  add(name: string, opts?: EventOptions, updateBoilerplate = true) {
    if (this.events.has(name)) return

    const event = new Event(
      name,
      this.serverChannel.server,
      this.serverChannel.namespace,
      this.serverChannel,
      opts,
    )

    this.events.set(name, event)

    if (updateBoilerplate)
      this.serverChannel.namespace.boilerplateEvents.set(name, opts)

    this.serverChannel.on(name, event.handler.bind(event))

    this.serverChannel.namespace.addEventToAllChannels(name, opts)
  }

  get(event: string) {
    return this.events.get(event)
  }

  has(event: string) {
    return this.events.has(event)
  }

  delete(event: string) {
    return this.events.delete(event)
  }

  propagate(event: string, payload: string) {
    this.events.get(event)?.propagate(payload)
  }

  clear() {
    this.events.clear()
  }

  deleteClientNode(node: ClientNode) {
    this.events.forEach(event => event.clients.delete(node._id))
  }

  defer(event: string, params?: Presentation.Params) {
    process.nextTick(() => {
      this.serverChannel.emit(event, params)
    })
  }
}

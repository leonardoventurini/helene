import { EventEmitter2 } from 'eventemitter2'
import { Server } from './server'
import { Presentation } from './presentation'
import { HttpTransportEvents } from './transports/http-transport'
import { HeleneEvents, ServerEvents } from '../constants'
import { WebSocketTransportEvents } from './transports/websocket-transport'
import { Event, EventOptions } from './event'
import { ClientNode } from './client-node'

const AllEvents: string[] = [
  ...Object.values(HttpTransportEvents),
  ...Object.values(ServerEvents),
  ...Object.values(WebSocketTransportEvents),
]

export class ServerChannel extends EventEmitter2 {
  chName: string
  server: Server
  events: Map<string, Event> = new Map()

  constructor(name: string) {
    super()
    this.chName = name

    this.onAny(event => {
      if (
        !this.events.has(event as string) &&
        !AllEvents.includes(event as string)
      ) {
        console.warn('Event Not Registered:', event)
      }
    })
  }

  setServer(server: Server) {
    this.server = server

    this.server.eventBlueprints.forEach((opts, name) => {
      this.addEvent(name, opts, false)
    })
  }

  propagate(event: string, payload: string) {
    this.events.get(event)?.propagate(payload)
  }

  defer(event: string, params?: Presentation.Params) {
    process.nextTick(() => {
      this.emit(event, params)
    })
  }

  /**
   * Refreshes a method by its identifier.
   *
   * @param method
   */
  refresh(method: string) {
    this.emit(HeleneEvents.METHOD_REFRESH, method)
  }

  addEvent(name: string, opts?: EventOptions, global = true) {
    if (this.events.has(name)) return

    const event = new Event(name, this.server, this, opts)

    this.events.set(name, event)
    this.on(name, event.handler.bind(event))

    if (global) {
      this.server.eventBlueprints.set(name, opts)
      this.server.addEventToAllChannels(name, opts)
    }
  }

  deleteClientNode(node: ClientNode) {
    this.events.forEach(event => event.clients.delete(node._id))
  }

  get list() {
    return Array.from(this.events.keys())
  }

  get length() {
    return this.events.size
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

  clear() {
    this.events.clear()
  }
}

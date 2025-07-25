import { HeleneEvents, ServerEvents } from '../utils'
import { EventEmitter2 } from 'eventemitter2'
import { ClientNode } from './client-node'
import { Event, EventOptions } from './event'
import { Server } from './server'
import { HttpTransportEvents, WebSocketTransportEvents } from './transports'

const SystemEvents: string[] = [
  ...Object.values(HttpTransportEvents),
  ...Object.values(ServerEvents),
  ...Object.values(WebSocketTransportEvents),
]

export class ServerChannel extends EventEmitter2 {
  channelName: string
  server: Server
  clients: Map<string, Set<ClientNode>> = new Map()

  constructor(channelName: string) {
    super({
      maxListeners: 1024,
    })

    this.channelName = channelName

    this.onAny((event, value) => {
      if (
        !this.server.events.has(event as string) &&
        !SystemEvents.includes(event as string)
      ) {
        console.warn('Event Not Registered:', event)
      }

      if (this.server.events.has(event as string)) {
        const eventObject = this.server.events.get(event as string)

        eventObject.handler(this, value)
      }
    })
  }

  setServer(server: Server) {
    this.server = server
  }

  propagate(event: string, payload: string) {
    const eventObject = this.server.events.get(event)

    if (!eventObject) {
      console.log('Event Not Registered:', event)
      return
    }

    const clients = this.clients.get(eventObject.name) ?? new Set()

    for (const client of clients) {
      client?.send(payload)
    }
  }

  defer<T = any>(event: string, params?: T) {
    process.nextTick(() => {
      this.emit(event, params)
    })
  }

  /**
   * Refreshes a method by its identifier.
   */
  refresh(method: string) {
    this.emit(HeleneEvents.METHOD_REFRESH, method)
  }

  /**
   * Declares a new event.
   */
  addEvent(name: string, opts?: EventOptions) {
    if (this.server.events.has(name)) {
      this.server.events.delete(name)
    }

    const event = new Event(name, this.server, this, opts)

    this.server.events.set(name, event)
  }

  addChannelClient(eventName: string, client: ClientNode) {
    if (!this.clients.get(eventName)?.add(client)) {
      this.clients.set(eventName, new Set([client]))
    }
  }

  deleteClientNode(node: ClientNode) {
    this.clients.forEach(clients => {
      clients.delete(node)
    })
  }

  get list() {
    return Array.from(this.server.events.keys())
  }

  get length() {
    return this.server.events.size
  }

  get(event: string) {
    return this.server.events.get(event)
  }

  has(event: string) {
    return this.server.events.has(event)
  }

  delete(event: string) {
    return this.server.events.delete(event)
  }

  clear() {
    this.clients.clear()
  }

  isSubscribed(client: ClientNode, event: Event) {
    return !!this.clients.get(event.name)?.has(client)
  }
}

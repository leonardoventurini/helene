import { EventEmitter2 } from 'eventemitter2'
import { Server } from './server'
import { Namespace } from './namespace'
import { EventManager } from './event-manager'
import { Presentation } from './presentation'
import { HttpTransportEvents } from './transports/http-transport'
import { HeleneEvents, ServerEvents } from '../constants'
import { WebSocketTransportEvents } from './transports/websocket-transport'

const AllEvents: string[] = [
  ...Object.values(HttpTransportEvents),
  ...Object.values(ServerEvents),
  ...Object.values(WebSocketTransportEvents),
]

export class ServerChannel extends EventEmitter2 {
  chName: string
  server: Server
  namespace: Namespace
  events: EventManager

  constructor(name: string) {
    super()
    this.chName = name
    this.events = new EventManager(this)

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
  }

  setNamespace(namespace: Namespace) {
    this.namespace = namespace

    namespace.eventBlueprints.forEach((opts, name) => {
      this.events.add(name, opts, false)
    })
  }

  propagate(event: string, payload: string) {
    this.events.propagate(event, payload)
  }

  defer(event: string, params?: Presentation.Params) {
    this.events.defer(event, params)
  }

  /**
   * Refreshes a method by its identifier.
   *
   * @param method
   */
  refresh(method: string) {
    this.emit(HeleneEvents.METHOD_REFRESH, method)
  }
}

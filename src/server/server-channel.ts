import { EventEmitter2 } from 'eventemitter2'
import { Server } from './server'
import { Namespace } from './namespace'
import { EventManager } from './event-manager'
import { Presentation } from './presentation'

export class ServerChannel extends EventEmitter2 {
  chName: string
  server: Server
  namespace: Namespace
  events: EventManager

  constructor(name: string) {
    super()
    this.chName = name
    this.events = new EventManager(this)
  }

  setServer(server: Server) {
    this.server = server
  }

  setNamespace(namespace: Namespace) {
    this.namespace = namespace

    namespace.boilerplateEvents.forEach((opts, name) => {
      this.events.add(name, opts, false)
    })
  }

  propagate(event: string, payload: string) {
    this.events.propagate(event, payload)
  }

  defer(event: string, params?: Presentation.Params) {
    this.events.defer(event, params)
  }
}

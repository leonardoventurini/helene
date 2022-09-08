import { Server } from './server'
import { v4 as uuid } from 'uuid'
import { Presentation } from './presentation'
import { ClientNode } from './client-node'
import { ServerChannel } from './server-channel'
import { Namespace } from './namespace'

export type EventOptions = {
  protected?: boolean
  ns?: string
}

export class Event {
  uuid: string
  name: string
  isProtected: boolean
  clients: Map<string, ClientNode> = new Map()
  namespace: Namespace
  channel: ServerChannel
  server: Server

  constructor(
    name: string,
    server: Server,
    namespace: Namespace,
    channel: ServerChannel,
    opts?: EventOptions,
  ) {
    this.uuid = uuid()
    this.name = name
    this.server = server
    this.namespace = namespace
    this.channel = channel

    this.isProtected = opts?.protected ?? false
  }

  propagate(payload: string) {
    this.clients.forEach(client => client.event(payload))
  }

  handler(params: Presentation.Params) {
    const channel = this.channel.chName

    const payload = Presentation.Outbound.event({
      event: this.name,
      channel,
      params,
    })

    if (this.server?.redisTransport?.pub) {
      this.server.redisTransport
        .publish(this.name, this.namespace.nsName, channel, payload)
        .catch(console.error)

      return
    }

    this.propagate(payload)
  }

  isSubscribed(client) {
    return this.clients.has(client._id)
  }
}

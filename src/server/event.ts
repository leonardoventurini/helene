import { Server } from './server'
import { v4 as uuid } from 'uuid'
import { Presentation } from './presentation'
import { ClientNode } from './client-node'
import { ServerChannel } from './server-channel'

export type EventOptions = {
  protected?: boolean
  ns?: string

  /**
   * Only allow user to subscribe to this event on his own channel. Automatically makes the event protected.
   */
  user?: boolean

  /**
   * This overrides the `user` flag.
   */
  shouldSubscribe?: (
    client: ClientNode,
    eventName: string,
    channel: string,
  ) => boolean
}

export class Event {
  uuid: string
  name: string
  isProtected: boolean
  channel: ServerChannel
  server: Server

  shouldSubscribe: (
    client: ClientNode,
    eventName: string,
    channel: string,
  ) => boolean = () => true

  constructor(
    name: string,
    server: Server,
    channel: ServerChannel,
    opts?: EventOptions,
  ) {
    this.uuid = uuid()
    this.name = name
    this.server = server
    this.channel = channel

    this.isProtected = opts?.protected ?? false

    if (opts?.user) {
      this.isProtected = true

      this.shouldSubscribe = function (client, event, channel) {
        return channel === client.userId.toString()
      }
    }

    if (opts?.shouldSubscribe) {
      this.shouldSubscribe = opts.shouldSubscribe
    }
  }

  handler(channel: ServerChannel, params: Presentation.Params) {
    const payload = Presentation.Outbound.event({
      event: this.name,
      channel: channel.channelName,
      params,
    })

    if (this.server?.redisTransport?.pub) {
      this.server.redisTransport
        .publish(this.name, channel.channelName, payload)
        .catch(console.error)

      return
    }

    channel.propagate(this.name, payload)
  }
}

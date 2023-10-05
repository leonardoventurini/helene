import { Server } from './server'
import { Presentation } from '@helenejs/utils'
import { ClientNode } from './client-node'
import { ServerChannel } from './server-channel'

export type EventOptions = {
  protected?: boolean

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
  ) => Promise<boolean>

  /**
   * This will propagate the event to other instances when running node in a cluster.
   */
  cluster?: boolean
}

export class Event {
  uuid: string
  name: string
  isProtected: boolean
  channel: ServerChannel
  server: Server
  cluster: boolean

  shouldSubscribe: (
    client: ClientNode,
    eventName: string,
    channel: string,
  ) => Promise<boolean> = async () => true

  constructor(
    name: string,
    server: Server,
    channel: ServerChannel,
    opts?: EventOptions,
  ) {
    this.uuid = Presentation.uuid()
    this.name = name
    this.server = server
    this.channel = channel

    this.isProtected = opts?.protected ?? false

    if (opts?.user) {
      this.isProtected = true

      this.shouldSubscribe = async function (client, event, channel) {
        if (!client.userId) return false

        return channel === client.userId.toString()
      }
    }

    if (opts?.shouldSubscribe) {
      this.shouldSubscribe = opts.shouldSubscribe
    }

    this.cluster = Boolean(opts?.cluster)
  }

  handler(channel: ServerChannel, params: Presentation.Params) {
    const payload = Presentation.Outbound.event({
      event: this.name,
      channel: channel.channelName,
      params,
    })

    if (this.cluster && this.server?.redisTransport?.pub) {
      this.server.redisTransport
        .publish(this.name, channel.channelName, payload)
        .catch(console.error)

      return
    }

    channel.propagate(this.name, payload)
  }
}

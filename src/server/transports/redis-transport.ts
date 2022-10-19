import { createClient, RedisClientOptions } from 'redis'
import { NO_CHANNEL, RedisListeners, ServerEvents } from '../../constants'
import { Server } from '../server'
import { Presentation } from '../presentation'
import { ClientNode } from '../client-node'

export type RedisMessage = {
  event: string
  channel: string
  message: string
}

export const RedisKey = {
  CLIENTS: 'helene:clients',
}

/**
 * This is mainly used to propagate events to other instances when running node in a cluster.
 */
export class RedisTransport {
  opts: RedisClientOptions
  pub: any
  sub: any

  server: Server

  static defaultRedisOpts: RedisClientOptions = {
    url: 'redis://localhost:6379',
  }

  constructor(server: Server, opts: RedisClientOptions) {
    this.server = server
    this.opts = opts

    this.connect().catch(console.error)
  }

  private async addClient(client: ClientNode) {
    await this.pub.sAdd(`helene:clients:${this.server.uuid}`, client._id)
    this.server.channel('admin').refresh('online:stats')
  }

  private async removeClient(client: ClientNode) {
    await this.pub.sRem(`helene:clients:${this.server.uuid}`, client._id)
    this.server.channel('admin').refresh('online:stats')
  }

  private async connect() {
    this.pub = createClient({
      ...RedisTransport.defaultRedisOpts,
      ...this.opts,
    })
    this.sub = this.pub.duplicate()

    await this.pub.connect()
    await this.sub.connect()

    await this.sub.pSubscribe(RedisListeners.EVENTS, redisMessage => {
      const { event, channel, message } =
        Presentation.decode<RedisMessage>(redisMessage)

      this.server.debugger(`Redis Transport Received:`, event, message)

      this.server.channel(channel).propagate(event, message)
    })

    this.addClient = this.addClient.bind(this)
    this.removeClient = this.removeClient.bind(this)

    this.server.on(ServerEvents.CONNECTION, this.addClient)
    this.server.on(ServerEvents.DISCONNECTION, this.removeClient)

    this.server.emit(ServerEvents.REDIS_CONNECT)

    this.pub.on('ready', () => {
      this.server.clients.forEach(client => this.addClient(client))
    })
  }

  async publish(event: string, channel: string = NO_CHANNEL, message: string) {
    if (!this.pub) return

    this.server.debugger(`Redis Transport Published:`, event, message)

    return this.pub.publish(
      RedisListeners.EVENTS,

      Presentation.encode<RedisMessage>({
        event,
        channel,
        message,
      }),
    )
  }

  async close() {
    this.server.off(ServerEvents.CONNECTION, this.addClient)
    this.server.off(ServerEvents.DISCONNECTION, this.removeClient)

    if (this.pub) {
      this.pub.del(`helene:clients:${this.server.uuid}`).catch(console.error)
    }

    if (this.pub?.isOpen) await this.pub.quit()
    if (this.sub?.isOpen) await this.sub.quit()

    this.pub = undefined
    this.sub = undefined
  }

  public async getStats() {
    const clients = await this.pub.sCard(`helene:clients:${this.server.uuid}`)

    return {
      clients,
    }
  }
}

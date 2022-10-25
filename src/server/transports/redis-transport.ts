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
  }

  private async removeClient(client: ClientNode) {
    await this.pub.sRem(`helene:clients:${this.server.uuid}`, client._id)

    // We can reuse this method since all authenticated users are clients.
    if (client.userId) {
      await this.pub.sRem(`helene:users:${this.server.uuid}`, client.userId)
    }
  }

  /**
   * We need this call because once the client connects it is not necessarily
   * a authenticated yet.
   */
  private async addUser(client: ClientNode) {
    if (!client.userId) return
    await this.pub.sAdd(`helene:users:${this.server.uuid}`, client.userId)
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

    this.addUser = this.addUser.bind(this)

    await this.pub.sAdd(`helene:servers`, this.server.uuid)

    this.server.on(ServerEvents.CONNECTION, this.addClient)
    this.server.on(ServerEvents.DISCONNECTION, this.removeClient)
    this.server.on(ServerEvents.AUTHENTICATION, this.addUser)

    this.server.emit(ServerEvents.REDIS_CONNECT)

    this.pub.on('ready', () => {
      this.server.allClients.forEach(client => this.addClient(client))
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
      await this.pub.del(`helene:clients:${this.server.uuid}`)
      await this.pub.sRem(`helene:servers`, this.server.uuid)
    }

    if (this.pub?.isOpen) await this.pub.quit()
    if (this.sub?.isOpen) await this.sub.quit()

    this.pub = undefined
    this.sub = undefined
  }

  public async getStats() {
    let clientCount = 0
    let userCount = 0
    const users = new Set()

    const servers = await this.pub.sMembers(`helene:servers`)

    for (const server of servers) {
      clientCount += await this.pub.sCard(`helene:clients:${server}`)
      userCount += await this.pub.sCard(`helene:users:${server}`)

      const serverUsers = await this.pub.sMembers(`helene:users:${server}`)

      serverUsers.forEach(user => users.add(user))
    }

    return {
      clientCount,
      userCount,
      users: Array.from(users),
    }
  }
}

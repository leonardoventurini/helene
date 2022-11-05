import { createClient, RedisClientOptions } from 'redis'
import { NO_CHANNEL, RedisListeners, ServerEvents } from '../../constants'
import { Server } from '../server'
import { Presentation } from '../presentation'

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

  constructor(server: Server, opts: RedisClientOptions | boolean) {
    this.server = server
    this.opts = Object.assign({}, RedisTransport.defaultRedisOpts, opts)

    this.connect().catch(console.error)
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

      // Do not add a debugger here, it will cause an infinite loop since it
      // triggers an event this also goes through the transport.

      this.server.channel(channel).propagate(event, message)
    })

    this.server.emit(ServerEvents.REDIS_CONNECT)
  }

  async publish(event: string, channel: string = NO_CHANNEL, message: string) {
    if (!this.pub) return

    // Do not add a debugger here, it will cause an infinite loop since it
    // triggers an event this also goes through the transport.

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

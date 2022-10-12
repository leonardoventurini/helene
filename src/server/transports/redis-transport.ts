import { createClient, RedisClientOptions } from 'redis'
import { NO_CHANNEL, RedisListeners, ServerEvents } from '../../constants'
import { Server } from '../server'
import { Presentation } from '../presentation'

export type RedisMessage = {
  event: string
  channel: string
  message: string
}

/**
 * This is mainly used to propagate events to other instances when running node in a cluster.
 */
export class RedisTransport {
  pub: any
  sub: any

  server: Server

  static defaultRedisOpts: RedisClientOptions = {
    url: 'redis://localhost:6379',
  }

  constructor(server: Server, opts: RedisClientOptions) {
    this.server = server

    this.connect(opts).catch(console.error)
  }

  async connect(opts: RedisClientOptions) {
    this.pub = createClient({ ...RedisTransport.defaultRedisOpts, ...opts })
    this.sub = this.pub.duplicate()

    await this.pub.connect()
    await this.sub.connect()

    await this.sub.pSubscribe(RedisListeners.EVENTS, redisMessage => {
      const { event, channel, message } =
        Presentation.decode<RedisMessage>(redisMessage)

      this.server.debugger(`Redis Transport Received:`, event, message)

      this.server.channel(channel).propagate(event, message)
    })

    this.server.emit(ServerEvents.REDIS_CONNECT)
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
    if (this.pub?.isOpen) await this.pub.quit()
    if (this.sub?.isOpen) await this.sub.quit()
    this.pub = undefined
    this.sub = undefined
  }
}

import { createClient, RedisClientOptions, RedisClientType } from 'redis'
import { NO_CHANNEL, RedisListeners, ServerEvents } from '../../constants'
import { Server } from '../server'
import { Presentation } from '../presentation'

export type RedisMessage = {
  namespace: string
  event: string
  channel: string
  message: string
}

/**
 * This is mainly used to propagate events to other instances when running node in a cluster.
 */
export class RedisTransport {
  pub: RedisClientType
  sub: RedisClientType
  server: Server

  static defaultRedisOpts = {
    pkg: 'ioredis',
    auth_pass: null,
    port: 6379,
    database: 0,
    namespace: 'helene',
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
      const { namespace, event, channel, message } =
        Presentation.decode<RedisMessage>(redisMessage)

      this.server.debugger(`Redis Transport Received:`, event, message)

      this.server.of(namespace).channel(channel).propagate(event, message)
    })

    this.server.emit(ServerEvents.REDIS_CONNECT)
  }

  async publish(
    event: string,
    namespace: string,
    channel: string = NO_CHANNEL,
    message: string,
  ) {
    if (!this.pub) return

    this.server.debugger(`Redis Transport Published:`, event, message)

    return this.pub.publish(
      RedisListeners.EVENTS,

      Presentation.encode<RedisMessage>({
        namespace,
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

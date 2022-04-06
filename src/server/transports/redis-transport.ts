import { ClientOpts, createClient, RedisClient } from 'redis'
import { NO_CHANNEL, RedisListeners, ServerEvents } from '../../constants'
import { Server } from '../server'
import { Presentation } from '../presentation'

export type RedisMessage = {
  namespace: string
  event: string
  channel: string
  message: string
}

export class RedisTransport {
  pub: RedisClient
  sub: RedisClient
  server: Server

  static defaultRedisOpts = {
    pkg: 'ioredis',
    auth_pass: null,
    port: 6379,
    database: 0,
    namespace: 'helene',
  }

  constructor(server: Server, opts: ClientOpts) {
    this.server = server
    this.pub = createClient({ ...RedisTransport.defaultRedisOpts, ...opts })
    this.sub = createClient({ ...RedisTransport.defaultRedisOpts, ...opts })

    this.sub.on(RedisListeners.CONNECT, () => {
      this.sub.subscribe(RedisListeners.EVENTS)

      this.sub.on(RedisListeners.MESSAGE, (channel, message) => {
        if (channel === RedisListeners.EVENTS) {
          const {
            namespace,
            event,
            channel,
            message: payload,
          } = Presentation.decode<RedisMessage>(message)

          this.server.debugger(`Redis Transport Received:`, event, payload)

          this.server.of(namespace).channel(channel).propagate(event, payload)
        }
      })

      this.server.emit(ServerEvents.REDIS_CONNECT)
    })
  }

  publish(
    event: string,
    namespace: string,
    channel: string = NO_CHANNEL,
    message: string,
  ) {
    if (!this.pub) return

    this.server.debugger(`Redis Transport Published:`, event, message)

    this.pub.publish(
      RedisListeners.EVENTS,

      Presentation.encode<RedisMessage>({
        namespace,
        event,
        channel,
        message,
      }),
    )
  }

  close() {
    this.pub?.end(true)
    this.pub?.unref()
    this.pub?.quit()
    this.sub?.end(true)
    this.sub?.unref()
    this.sub?.quit()
    this.pub = undefined
    this.sub = undefined
  }
}

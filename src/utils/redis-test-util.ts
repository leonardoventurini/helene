import { createClient, RedisClientOptions, RedisClientType } from 'redis'

export class RedisTestUtil {
  pub: RedisClientType
  sub: RedisClientType

  constructor(opts?: RedisClientOptions) {
    this.connect(opts).catch(console.error)
  }

  async connect(opts: RedisClientOptions) {
    const defaultOptions = {
      pkg: 'ioredis',
      host: '127.0.0.1',
      auth_pass: null,
      port: 6379,
      database: 0,
      namespace: 'helene',
    }

    this.pub = createClient({ ...defaultOptions, ...opts })
    this.sub = createClient({ ...defaultOptions, ...opts })

    await this.pub.connect()
    await this.sub.connect()

    // Need to quit otherwise it hangs the server.
    after(async () => {
      await this.pub.quit()
      await this.sub.quit()
    })
  }

  publishNextTick(channel: string, value: string) {
    process.nextTick(() => {
      this.pub.publish(channel, value).catch(console.error)
    })
  }

  wait(channel: string, callback?) {
    return new Promise((resolve, reject) => {
      this.sub
        .pSubscribe(channel, function (message: string) {
          if (callback) {
            resolve(callback(channel, message))
          } else {
            resolve({ channel, message })
          }
        })
        .catch(reject)
    })
  }
}

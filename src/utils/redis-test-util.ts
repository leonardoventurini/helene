import { ClientOpts, createClient, RedisClient } from 'redis'

export class RedisTestUtil {
  pubsub: RedisClient
  subpub: RedisClient

  constructor(opts?: ClientOpts) {
    const defaultOptions = {
      pkg: 'ioredis',
      host: '127.0.0.1',
      auth_pass: null,
      port: 6379,
      database: 0,
      namespace: 'helene',
    }

    this.pubsub = createClient({ ...defaultOptions, ...opts })
    this.subpub = createClient({ ...defaultOptions, ...opts })

    // Needs to quit otherwise it hangs the server.
    after(async () => {
      this.pubsub.quit()
      this.subpub.quit()
    })
  }

  publishNextTick(channel: string, value: string) {
    process.nextTick(() => {
      this.subpub.subscribe(channel)
      this.pubsub.publish(channel, value)
    })
  }

  wait(event: string, callback?) {
    return new Promise(resolve => {
      this.subpub.once(event, function (channel: string, message: string) {
        if (callback) {
          resolve(callback(channel, message))
        } else {
          resolve({ channel, message })
        }
      })
    })
  }
}

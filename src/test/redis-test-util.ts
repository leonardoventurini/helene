import { createClient, RedisClientOptions } from 'redis'
import { beforeAll, afterAll } from 'vitest'

export class RedisTestUtil {
  pub: any
  sub: any

  constructor(opts?: RedisClientOptions) {
    this.connect(opts).catch(console.error)
  }

  async connect(opts: RedisClientOptions) {
    const defaultOptions: RedisClientOptions = {
      url: 'redis://localhost:6379',
    }

    beforeAll(async () => {
      this.pub = createClient({ ...defaultOptions, ...opts })
      this.sub = createClient({ ...defaultOptions, ...opts })

      await this.pub.connect()
      await this.sub.connect()
    })

    // Need to quit otherwise it hangs the server.
    afterAll(async () => {
      await this.pub.quit()
      await this.sub.quit()

      this.pub = undefined
      this.sub = undefined
    })
  }

  deferPublish(channel: string, value: string) {
    setTimeout(() => {
      this.pub.publish(channel, value).catch(console.error)
    }, 0)
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

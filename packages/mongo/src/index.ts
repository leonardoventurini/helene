import { MongoClient } from 'mongodb'

/**
 * We can use SiftJS instead of using Minimongo matcher or even Helene Data matchers.
 *
 * As a last resort, we can fork the project as it seems to already be written in TypeScript and should be easier to maintain.
 *
 * https://github.com/crcn/sift.js
 */
export namespace Mongo {
  export let client = null
  export async function connect(url?: string) {
    if (url) {
      client = new MongoClient(url)
    }

    if (process.env.HELENE_MONGO_URL) {
      client = new MongoClient(process.env.HELENE_MONGO_URL)
    }

    if (client) {
      return client.connect()
    }

    return false
  }
}

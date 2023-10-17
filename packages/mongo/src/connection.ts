import { MongoClient } from 'mongodb'

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

import { Client } from './client'
import axios from 'axios'
import { Reject, Resolve } from './promise-queue'
import { Presentation } from '@/server/presentation'
import http from 'axios/lib/adapters/http'
import { Environment } from '@/utils/environment'

export class ClientHttp {
  client: Client
  protocol: string
  host: string
  uri: string

  constructor(client: Client) {
    this.client = client
    this.protocol = this.client.secure ? `https://` : `http://`

    if (this.client.port) {
      this.host = `${this.protocol}${this.client.host}:${this.client.port}`
    } else {
      this.host = `${this.protocol}${this.client.host}`
    }

    this.uri = `${this.host}/__h`
  }

  async request(
    payload: Record<string, any>,
    resolve: Resolve,
    reject: Reject,
  ) {
    try {
      const { data: result } = await axios.post(
        this.uri,
        {
          context: this.client.context,
          payload,
        },
        {
          withCredentials: true,
          adapter: Environment.isNode ? http : undefined,
        },
      )

      if (
        result instanceof Object &&
        result.type === Presentation.PayloadType.ERROR
      )
        return reject(result)

      if (resolve) resolve(result)
    } catch (error) {
      return reject(error)
    }
  }
}

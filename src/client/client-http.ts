import { Client } from './client'
import { Reject, Resolve } from './promise-queue'
import { Presentation } from '../utils/presentation'
import { EJSON } from 'ejson2'
import { TOKEN_HEADER_KEY } from '../utils/constants'
import { fetch } from 'fetch-undici'

export class ClientHttp {
  client: Client
  protocol: string
  host: string
  uri: string

  constructor(client: Client) {
    this.client = client
    this.protocol = this.client.options.secure ? `https://` : `http://`

    if (this.client.options.port) {
      this.host = `${this.protocol}${this.client.options.host}:${this.client.options.port}`
    } else {
      this.host = `${this.protocol}${this.client.options.host}`
    }

    this.uri = `${this.host}/__h`
  }

  async request(
    payload: Record<string, any>,
    resolve: Resolve,
    reject: Reject,
  ) {
    try {
      const data = await fetch(this.uri, {
        method: 'POST',
        headers: {
          Accept: 'text/plain, */*',
          'Content-Type': 'text/plain',
          ...(this.client.context.token
            ? { [TOKEN_HEADER_KEY]: this.client.context.token }
            : {}),
        },
        body: EJSON.stringify({
          context: this.client.context,
          payload,
        }),
      })

      let result = await data.text()

      try {
        result = EJSON.parse(result)
      } catch {
        throw new Error(`${data.status} ${data.statusText}: ${result}`)
      }

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

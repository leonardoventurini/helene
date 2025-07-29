import {
  CLIENT_ID_HEADER_KEY,
  ClientEvents,
  PayloadType,
  Presentation,
  Reject,
  Resolve,
  TOKEN_HEADER_KEY,
} from '../utils'
import { EJSON } from '../ejson'
import { Client } from './client'

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
      // @ts-ignore
      const data = await fetch(this.uri, {
        method: 'POST',
        headers: {
          [CLIENT_ID_HEADER_KEY]: this.client.uuid,
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

      if (data.status !== 200) {
        return reject(
          new Error(
            `${data.status} ${data.statusText}: ${JSON.stringify(
              await data.text(),
            )}`,
          ),
        )
      }

      if (!resolve) {
        return
      }

      const response = await data.text()

      const decoded = Presentation.decode(response)

      this.client.emit(ClientEvents.INBOUND_MESSAGE, decoded)

      if (decoded.type === PayloadType.ERROR) return reject(decoded)

      resolve(decoded.result)
    } catch (error) {
      return reject(error)
    }
  }
}

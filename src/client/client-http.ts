import { Client } from './client'
import { Reject, Resolve } from './promise-queue'
import { Presentation } from '../utils/presentation'
import { EJSON } from 'ejson2'
import { CLIENT_ID_HEADER_KEY, ClientEvents, TOKEN_HEADER_KEY } from '../utils'
import { fetch } from 'fetch-undici'
import IsomorphicEventSource from '@sanity/eventsource'

export class ClientHttp {
  client: Client
  protocol: string
  host: string
  uri: string
  clientEventSource: EventSource

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

  // @todo Recreate event source on token change.
  async createEventSource() {
    if (!this.client.options.eventSource) return

    this.clientEventSource = new IsomorphicEventSource(this.uri, {
      headers: {
        [CLIENT_ID_HEADER_KEY]: this.client.uuid,
        ...(this.client.context.token
          ? { [TOKEN_HEADER_KEY]: this.client.context.token }
          : {}),
      },
      withCredentials: true,
    }) as EventSource

    this.clientEventSource.onmessage = (event: MessageEvent) => {
      this.client.emit(ClientEvents.INBOUND_MESSAGE, event.data)

      const payload = Presentation.decode(event.data)

      this.client.payloadRouter(payload)
    }
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

      let response = await data.text()

      response = Presentation.decode(response)

      if (response.type === Presentation.PayloadType.ERROR)
        return reject(response)

      if (resolve) resolve(response.result)
    } catch (error) {
      return reject(error)
    }
  }
}

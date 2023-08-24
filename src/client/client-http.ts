import { Client } from './client'
import { Reject, Resolve } from './promise-queue'
import { Presentation } from '../utils/presentation'
import { EJSON } from 'ejson2'
import { CLIENT_ID_HEADER_KEY, ClientEvents, TOKEN_HEADER_KEY } from '../utils'
import { fetch } from 'fetch-undici'
import EventSource from '@sanity/eventsource'
import { defer } from 'lodash'

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

  get isEventSourceConnected() {
    return Boolean(this.clientEventSource?.readyState === EventSource.OPEN)
  }

  // @todo Recreate event source on token change.
  createEventSource() {
    return new Promise(resolve => {
      this.client.emit(ClientEvents.EVENTSOURCE_CREATE)

      if (!this.client.options.eventSource) {
        return resolve(null)
      }

      this.clientEventSource = new EventSource(this.uri, {
        headers: {
          [CLIENT_ID_HEADER_KEY]: this.client.uuid,
          ...(this.client.context.token
            ? { [TOKEN_HEADER_KEY]: this.client.context.token }
            : {}),
        },
        withCredentials: true,
        // @ts-ignore
        heartbeatTimeout: 600000,
      }) as EventSource

      this.clientEventSource.onmessage = (event: MessageEvent) => {
        this.client.emit(ClientEvents.INBOUND_MESSAGE, event.data)

        const payload = Presentation.decode(event.data)

        this.client.payloadRouter(payload)
      }

      this.clientEventSource.onopen = () => {
        defer(() => {
          this.client.emit(ClientEvents.EVENTSOURCE_OPEN)
          resolve(this.clientEventSource)
        })
      }

      this.clientEventSource.onerror = (error: any) => {
        if (error.message) {
          this.client.emit(ClientEvents.EVENTSOURCE_ERROR)
          console.error(error.message)
        }
      }
    })
  }

  close() {
    if (this.clientEventSource) {
      this.clientEventSource.close()
      this.clientEventSource = null
      this.client.emit(ClientEvents.EVENTSOURCE_CLOSE)
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

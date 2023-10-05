import { Client } from './client'
import { Reject, Resolve } from './promise-queue'
import {
  CLIENT_ID_HEADER_KEY,
  ClientEvents,
  Presentation,
  TOKEN_HEADER_KEY,
} from '@helenejs/utils'
import { EJSON } from 'ejson2'
import EventSource from '@sanity/eventsource'
import defer from 'lodash/defer'
import MethodResultPayload = Presentation.MethodResultPayload
import ErrorPayload = Presentation.ErrorPayload

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

      const response = await data.text()

      const decoded = Presentation.decode<MethodResultPayload | ErrorPayload>(
        response,
      )

      if (decoded.type === Presentation.PayloadType.ERROR)
        return reject(decoded)

      if (resolve) resolve(decoded.result)
    } catch (error) {
      return reject(error)
    }
  }
}

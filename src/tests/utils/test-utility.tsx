// @ts-ignore
import React from 'react'
import { Server, ServerOptions } from '../../server'
import { ClientEvents, NO_CHANNEL, ServerEvents } from '../../utils'
import { Client, ClientOptions } from '../../client'
import { ClientProvider } from '../../react'

export class TestUtility {
  server: Server
  client: Client
  host = 'localhost'
  port: number

  constructor({
    debug = false,
    globalInstance = true,
    redis = undefined,
  } = {}) {
    this.port = this.randomPort

    beforeEach(async () => {
      this.server = await this.createSrv({
        debug,
        globalInstance,
        origins: ['http://localhost'],
        redis,
      })

      this.client = await this.createClient({
        debug,
      })
    })

    afterEach(async () => {
      await this.client?.close()
      await this.server?.close()
    })
  }

  get address() {
    return `${this.host}:${this.port}`
  }

  get randomPort() {
    return Math.floor(Math.random() * (65536 - 40001) + 40000)
  }

  async createSrv(opts?: ServerOptions) {
    return new Promise<Server>((resolve, reject) => {
      const server = new Server({
        host: this.host,
        port: opts?.port ?? this.port,
        rateLimit: true,
        ...opts,
      })

      after(async () => {
        await server?.close()
      })

      server.once(ServerEvents.READY, () => resolve(server))
      server.once(Server.ERROR_EVENT, error => reject(error))
    })
  }

  async createRandomSrv(opts?: ServerOptions) {
    return this.createSrv({
      port: this.randomPort,
      ...opts,
    })
  }

  async createClient(opts?: ClientOptions) {
    return new Promise<Client>((resolve, reject) => {
      const client = new Client({
        host: opts?.host ?? this.host,
        port: opts?.port ?? this.port,

        eventSource: false,

        ...opts,

        ws: {
          reconnect: false,
          reconnectRetries: 3,

          ...opts?.ws,
        },
      })

      after(async () => {
        await client?.close()
      })

      client.once(ClientEvents.INITIALIZED, () => {
        resolve(client)
      })

      client.once(ClientEvents.WEBSOCKET_BACKOFF_FAIL, () =>
        reject(new Error('WebSocket Backoff Failed')),
      )

      client.once(ClientEvents.ERROR, error => reject(error))
    })
  }

  async createHttpClient(opts?: ClientOptions) {
    return this.createClient({
      ...opts,
      eventSource: true,
      ws: {
        autoConnect: false,
      },
    })
  }

  async createEvent(event: string, channel: string = NO_CHANNEL) {
    this.server.addEvent(event)
    await this.client.channel(channel).subscribe(event)
  }

  async catchError(callback: Promise<any> | (() => Promise<any>)) {
    try {
      await (callback instanceof Promise ? callback : callback)
      return null
    } catch (e) {
      return e
    }
  }

  async sleep(timeout = 1000) {
    return new Promise<void>(resolve => {
      setTimeout(() => resolve(), timeout)
    })
  }

  get wrapper() {
    const client = this.client

    return function wrapper({ children }) {
      return <ClientProvider clientInstance={client}>{children}</ClientProvider>
    }
  }
}

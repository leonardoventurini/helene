// @ts-ignore
import React from 'react'
import { EventOptions, Server, ServerOptions } from '../../server'
import { ClientEvents, NO_CHANNEL, ServerEvents } from '../../utils'
import { Client, ClientOptions } from '../../client'
import { ClientProvider } from '../../react'
import { afterEach } from 'mocha'

export class TestUtility {
  server: Server
  client: Client
  host = '127.0.0.1'
  port: number

  constructor({
    debug = false,
    globalInstance = true,
    redis = undefined,
  } = {}) {
    beforeEach(async () => {
      // Make sure we have a different server for each test
      this.port = this.randomPort

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
      await this.client.close()
      await this.server.close()
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

      afterEach(async () => {
        setTimeout(() => {
          server.close()
        }, 200)
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
      const port = opts?.port ?? this.port

      const client = new Client({
        host: opts?.host ?? this.host,
        port,

        eventSource: false,

        ...opts,

        ws: {
          reconnect: false,
          reconnectRetries: 3,

          ...opts?.ws,
        },
      })

      afterEach(async () => {
        if (client.connected) await client.close()
      })

      client.once(ClientEvents.INITIALIZED, () => {
        resolve(client)
      })

      client.once(ClientEvents.ERROR, error => reject(error))

      if (this.server.port === port) {
        this.server.once(ServerEvents.CLOSED, () => {
          client.close()
        })
      }
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

  async createEvent(
    event: string,
    channel: string = NO_CHANNEL,
    opts?: EventOptions,
  ) {
    this.server.addEvent(event, opts)
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

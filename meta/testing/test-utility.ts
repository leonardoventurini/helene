import { Client, ClientOptions, TransportMode } from '@helenejs/client'
import { EventOptions, Server, ServerOptions } from '@helenejs/server'
import { ClientEvents, NO_CHANNEL, ServerEvents, sleep } from '@helenejs/utils'

const PORTS = new Set()

export class TestUtility {
  server: Server
  client: Client
  host = '127.0.0.1'
  port: number

  clients: Client[] = []
  servers: Server[] = []

  constructor({
    debug = false,
    globalInstance = false,
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
      this.clients.forEach(client => client.close())
      this.servers.forEach(server => server.close())
      this.clients = []
      this.servers = []

      await sleep(100)
    })
  }

  get address() {
    return `${this.host}:${this.port}`
  }

  get randomPort() {
    const gen = () => Math.floor(Math.random() * (65536 - 40001) + 40000)

    let port = gen()

    while (PORTS.has(port)) {
      port = gen()
    }

    PORTS.add(port)

    return port
  }

  async createSrv(opts?: ServerOptions) {
    return new Promise<Server>((resolve, reject) => {
      let server: Server = null

      while (!server) {
        try {
          server = new Server({
            host: this.host,
            port: opts?.port ?? this.port,
            rateLimit: true,
            globalInstance: false,
            ...opts,
          })
        } catch (e) {
          if (e.code === 'EADDRINUSE') {
            this.port = this.randomPort
          } else {
            throw e
          }
        }
      }

      server.once(ServerEvents.READY, () => {
        this.servers.push(server)
        resolve(server)
      })
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
        mode: TransportMode.WebSocket,
        ...opts,
      })

      client.once(ClientEvents.INITIALIZED, () => {
        this.clients.push(client)
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
      mode: TransportMode.HttpSSE,
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
}

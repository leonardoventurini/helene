import { Method, MethodFunction, MethodOptions } from './method'
import { DefaultMethods } from './default-methods'
import { ClientNode } from './client-node'
import { v4 as uuid } from 'uuid'
import { NO_CHANNEL } from '../constants'
import { ServerChannel } from './server-channel'
import { EventOptions } from './event'

export class Namespace extends ServerChannel {
  uuid: string
  nsName: string
  methods: Map<string, Method> = new Map()
  clients: Map<string, ClientNode> = new Map()
  channels: Map<string, ServerChannel> = new Map()

  boilerplateEvents: Map<string, EventOptions> = new Map()

  constructor(name: string) {
    super(NO_CHANNEL)
    this.setNamespace(this)

    this.uuid = uuid()
    this.nsName = name

    this.channels.set(NO_CHANNEL, this)
  }

  createDefaultMethods() {
    Object.entries(DefaultMethods).forEach(([key, value]) =>
      this.methods.set(key, value(this.server, this)),
    )
  }

  getMethod(method: string) {
    return this.methods.get(method)
  }

  addClient(node: ClientNode) {
    this.clients.set(node._id, node)
  }

  deleteClient(node: ClientNode) {
    this.clients.delete(node._id)
    this.channels.forEach(channel => channel.events.deleteClientNode(node))
  }

  register(method: string, fn: MethodFunction, opts?: MethodOptions) {
    this.methods.set(method, new Method(fn, opts))
  }

  close() {
    this.clients.forEach(node => node.close())
    this.clients.clear()
    this.methods.clear()
    this.channels.clear()
    this.server.namespaces.delete(this.nsName)
  }

  channel(name: string = NO_CHANNEL) {
    if (!name) return this
    if (name === NO_CHANNEL) return this

    if (this.channels.has(name)) return this.channels.get(name)
    const channel = new ServerChannel(name)
    channel.setServer(this.server)
    channel.setNamespace(this)
    this.channels.set(name, channel)
    return channel
  }

  addEventToAllChannels(name: string, opts?: EventOptions) {
    this.channels.forEach(channel => channel.events.add(name, opts, false))
  }
}

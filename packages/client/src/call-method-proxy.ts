import { Client } from './client'

export function callMethodProxy(client: Client, path = '') {
  return new Proxy(function () {}, {
    get(_, prop) {
      const newPath = path ? `${path}.${prop as string}` : (prop as string)
      return callMethodProxy(client, newPath)
    },
    apply(_, __, args) {
      return client.call(path, ...args)
    },
  })
}

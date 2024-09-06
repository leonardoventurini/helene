import { Client, ProxyMethodCall } from './client'

export function callMethodProxy(client: Client, path = '') {
  return new Proxy(function () {} as ProxyMethodCall, {
    get(_, prop) {
      const newPath = path ? `${path}.${prop as string}` : (prop as string)
      return callMethodProxy(client, newPath)
    },
    apply(_, __, args) {
      return client.call(path, ...args)
    },
  })
}

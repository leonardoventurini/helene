import { Server } from './server'

export function createMethodProxy(server: Server, path = '') {
  return new Proxy(
    {},
    {
      get(_, prop) {
        const newPath = path ? `${path}.${prop as string}` : (prop as string)
        return createMethodProxy(server, newPath)
      },
      set(_, prop, value) {
        const propertyPath = path
          ? `${path}.${prop as string}`
          : (prop as string)
        server.addMethod(propertyPath, value?.[0] ?? value, value?.[1])
        return true
      },
    },
  )
}

function gp() {
  if (typeof process === 'undefined') return null
  return process
}

function env(key) {
  return gp()?.env[key]
}

export namespace Environment {
  export const isNode = gp()?.versions?.node
  export const isBrowser = typeof window === 'object'
  export const isTest = env('NODE_ENV') === 'test'
  export const isDevelopment = env('NODE_ENV') === 'development'
}

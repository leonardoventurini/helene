if (typeof process === 'undefined') {
  // @ts-ignore
  window.process = {}
}

export namespace Environment {
  export const isNode = !!process?.versions?.node
  export const isBrowser = typeof window === 'object'
}

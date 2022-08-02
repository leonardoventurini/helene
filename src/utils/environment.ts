export namespace Environment {
  export const isNode =
    typeof process !== 'undefined' && !!process.versions?.node
  export const isBrowser = typeof window === 'object'
}

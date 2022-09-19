export namespace Environment {
  export const isNode =
    typeof process !== 'undefined' && !!process.versions?.node
  export const isBrowser = typeof window === 'object'
  export const isTest =
    typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
  export const isDevelopment =
    typeof process !== 'undefined' && process.env.NODE_ENV === 'development'
}

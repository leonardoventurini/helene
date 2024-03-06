const gp = (() => {
  if (typeof process === 'undefined') return null
  return process
})()

export namespace Environment {
  export const isNode = !!gp?.versions?.node
  export const isBrowser = typeof window === 'object'
  export const isTest = process.env.NODE_ENV === 'test'
  export const isDevelopment = process.env.NODE_ENV === 'development'

  export const canUseDOM = !!(
    typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement
  )

  export const isServer = !canUseDOM
}

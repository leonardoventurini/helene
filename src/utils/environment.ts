export namespace Environment {
  export const isNode = !!process?.versions?.node
  export const isTest = process.env.NODE_ENV === 'test'
  export const isDevelopment = process.env.NODE_ENV === 'development'
  export const isProduction = process.env.NODE_ENV === 'production'
  export const isDebug = process.env.DEBUG === '1'
  export const protocol = isProduction ? 'https' : 'http'
}

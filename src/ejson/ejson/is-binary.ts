import { PolyfillableArray } from '../utils'

export const isBinary = (obj: Uint8Array & PolyfillableArray) => {
  return !!(
    (typeof Uint8Array !== 'undefined' && obj instanceof Uint8Array) ||
    (obj && obj.$Uint8ArrayPolyfill)
  )
}

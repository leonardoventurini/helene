import isArray from 'lodash/isArray'
import isObject from 'lodash/isObject'

export namespace Helpers {
  export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
  export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

  export interface IRPCError {
    code: number
    message: string
    data?: string
  }

  export function isSecure() {
    return (
      typeof window === 'object' && document?.location?.protocol === 'https:'
    )
  }

  export function extend(target: object, source: object) {
    Object.entries(source).forEach(([key, fn]) => {
      target[key] = fn.bind(target)
    })
  }

  export function getCircularReplacer() {
    const seen = new WeakSet()

    return (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return
        }
        seen.add(value)
      }
      return value
    }
  }

  export function ensureArray(value: any) {
    return isArray(value) ? value : [value]
  }

  export function toString(id: any) {
    if (isObject(id) && id.constructor.name === 'ObjectId') {
      return id.toString()
    }

    return String(id)
  }
}

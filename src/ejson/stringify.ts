import { EJSON } from './index'
import stableStringify from 'json-stable-stringify'

export type StringifyOptions = {
  indent?: boolean | number
  canonical?: boolean
}

export const stringify = (item: any, options?: StringifyOptions) => {
  const json = EJSON.toJSONValue(item)

  const space =
    options?.indent === true ? 2 : (options?.indent as number) ?? undefined

  if (options?.canonical) {
    return stableStringify(json, {
      space,
    })
  }

  return options?.indent
    ? JSON.stringify(json, null, space)
    : JSON.stringify(json)
}

import { identity, isString } from 'lodash'
import { Helpers } from '../utils/helpers'
import { v4 } from 'uuid'
import { Errors } from '../errors'
import { Environment } from '../utils/environment'
import { EJSON } from 'ejson2'

export namespace Presentation {
  export type Params = Record<string, any> | any[] | any

  export const uuid = v4

  export enum PayloadType {
    METHOD = 'method',
    RESULT = 'result',
    EVENT = 'event',
    ERROR = 'error',
  }

  export type MethodCallPayload = {
    uuid: string
    type: PayloadType.METHOD
    method: string
    params?: Params
    void?: boolean
  }

  export type MethodCallPayloadPartial = Omit<MethodCallPayload, 'type'>

  export type MethodResultPayload = {
    uuid: string
    type: PayloadType.RESULT
    method: string
    result: any
  }

  export type MethodResultPayloadPartial = Omit<MethodResultPayload, 'type'>

  export type EventPayload = {
    uuid: string
    type: PayloadType.EVENT
    event: string
    channel?: string
    params?: Params
  }

  export type EventPayloadPartial = Omit<
    Presentation.EventPayload,
    'uuid' | 'type'
  >

  export type ErrorPayload = {
    uuid?: string
    type: PayloadType.ERROR
    code?: Errors
    message: string
    stack?: string
    method?: string
    errors?: string[]
  }

  export type ErrorPayloadPartial = Helpers.PartialBy<
    Omit<ErrorPayload, 'type'>,
    'message'
  >

  export type Payload =
    | MethodCallPayload
    | MethodResultPayload
    | EventPayload
    | ErrorPayload

  export function decode<T = Payload>(
    payload: string | ArrayBuffer | Buffer | Buffer[],
  ): T {
    if (Environment.isBrowser && !Environment.isTest) {
      return EJSON.parse(payload as string)
    }

    const isArrayBuffer =
      typeof ArrayBuffer === 'function' && payload instanceof ArrayBuffer
    const isBuffer = typeof Buffer === 'function' && payload instanceof Buffer

    let decoded: string

    if (isString(payload)) {
      decoded = payload as string
    } else if (isBuffer || isArrayBuffer) {
      decoded = Buffer.from(payload as ArrayBuffer | Buffer).toString()
    }

    if (!decoded) {
      throw new Error('No Payload')
    }

    return EJSON.parse(decoded)
  }

  export function encode<T = Payload>(payload: T): string {
    return EJSON.stringify(payload, Helpers.getCircularReplacer())
  }

  export namespace Inbound {
    export function call(payload: MethodCallPayloadPartial, raw = false) {
      return (raw ? identity : encode)({
        type: PayloadType.METHOD,
        ...payload,
      })
    }
  }

  export namespace Outbound {
    export function event(payload: EventPayloadPartial, raw = false) {
      return (raw ? identity : encode)({
        uuid: uuid(),
        type: PayloadType.EVENT,
        ...payload,
      })
    }

    export function result(payload: MethodResultPayloadPartial, raw = false) {
      return (raw ? identity : encode)({
        type: PayloadType.RESULT,
        ...payload,
      })
    }

    export function error(payload: ErrorPayloadPartial, raw = false) {
      return (raw ? identity : encode)({
        type: PayloadType.ERROR,
        ...payload,
      })
    }
  }
}

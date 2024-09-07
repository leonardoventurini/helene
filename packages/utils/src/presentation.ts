import { Errors, Helpers } from './index'
import { EJSON } from 'ejson2'
import { v4 } from '@lukeed/uuid'
import isString from 'lodash/isString'

export enum PayloadType {
  METHOD = 'method',
  RESULT = 'result',
  EVENT = 'event',
  ERROR = 'error',
  SETUP = 'setup',
}

export namespace Presentation {
  export type Params = Record<string, any> | any[] | any

  export const uuid = v4

  export type SetupPayload = {
    uuid: string
    type: PayloadType.SETUP
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
    | SetupPayload

  export function decode<T = Payload>(payload: string | { data: string }): T {
    return EJSON.parse(isString(payload) ? payload : payload.data)
  }

  export function encode<T = Payload>(payload: T): string {
    return EJSON.stringify(payload)
  }
}

import { v4 } from '@lukeed/uuid'
import { EJSON } from '../ejson'
import isString from 'lodash/isString'

export enum PayloadType {
  METHOD = 'method',
  RESULT = 'result',
  EVENT = 'event',
  ERROR = 'error',
  SETUP = 'setup',
  HEARTBEAT = 'heartbeat',
}

export namespace Presentation {
  export const uuid = v4

  export type Payload = {
    type: PayloadType
    [key: string]: any
  }

  export function decode<T = Payload>(payload: string | { data: string }): T {
    return EJSON.parse(isString(payload) ? payload : payload.data)
  }

  export function encode<T = Payload>(payload: T): string {
    return EJSON.stringify(payload)
  }
}

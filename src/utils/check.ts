import { PublicError } from '../errors'
import { isBoolean, isNil, isNumber, isString } from 'lodash'

export function check(
  name: string,
  value: any,
  type?: StringConstructor | BooleanConstructor | NumberConstructor,
) {
  if (isNil(value))
    throw new PublicError(`The parameter '${name}' was not found`)

  if (type === String && !isString(value))
    throw new PublicError(`The parameter '${name}' is not a string`)

  if (type === Number && !isNumber(value))
    throw new PublicError(`The parameter '${name}' is not a number`)

  if (type === Boolean && !isBoolean(value))
    throw new PublicError(`The parameter '${name}' is not a boolean`)
}

import memoize from 'memoizee'
import { ClientNode } from './client-node'
import { Presentation } from './presentation'
import { v4 as uuid } from 'uuid'
import { HeleneAsyncLocalStorage } from './helene-async-local-storage'
import { isEmpty } from 'lodash'
import { intercept } from '../utils/intercept'
import { AnyFunction } from '../types'
import { AnyObjectSchema } from 'yup'
import { Errors, SchemaValidationError } from '../errors'

export type MethodParams = any
export type MethodFunction = (this: ClientNode, params?: MethodParams) => any

export interface MethodOptions {
  ns?: string
  cache?: boolean
  maxAge?: number
  protected?: boolean
  middleware?: AnyFunction[]
  schema?: AnyObjectSchema
}

export class Method {
  uuid: string
  fn: MethodFunction
  isProtected: boolean
  middleware: AnyFunction[]
  schema: AnyObjectSchema = null

  constructor(fn: MethodFunction, opts: MethodOptions) {
    const { cache, maxAge = 60000, schema } = opts ?? {}

    this.uuid = Presentation.uuid()
    this.isProtected = opts?.protected
    this.middleware = opts?.middleware
    this.fn = cache
      ? memoize(fn, {
          maxAge,
          normalizer: function ([params]) {
            return JSON.stringify(params)
          },
        })
      : fn

    this.schema = schema
  }

  async runMiddleware(params: MethodParams, node?: ClientNode) {
    if (isEmpty(this.middleware)) return params

    const wrapped = this.middleware.map(m => intercept(m))

    let buffer = params

    for (const step of wrapped) {
      buffer = await step.call(node, buffer)
    }

    return buffer
  }

  async exec(params: MethodParams, node?: ClientNode) {
    if (this.schema) {
      try {
        await this.schema.validate(params)
      } catch (error) {
        console.error(error)
        throw new SchemaValidationError(Errors.INVALID_PARAMS, error.errors)
      }
    }

    const result = await this.runMiddleware(params, node)

    return HeleneAsyncLocalStorage.run(
      { executionId: uuid(), context: node.context },
      async () => this.fn.call(node, result),
    )
  }
}

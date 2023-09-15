import memoize from 'memoizee'
import { ClientNode } from './client-node'
import {
  AnyFunction,
  Errors,
  intercept,
  Presentation,
  SchemaValidationError,
  ServerEvents,
} from '../utils'
import { HeleneAsyncLocalStorage } from './helene-async-local-storage'
import isEmpty from 'lodash/isEmpty'
import { AnyObjectSchema, ObjectSchema } from 'yup'
import { EJSON } from 'bson'
import perf_hooks from 'perf_hooks'
import { Server } from './server'

export type MethodParams = any
export type MethodFunction = (this: ClientNode, params?: MethodParams) => any

/**
 * @todo Add support for timeout monitoring.
 */
export interface MethodOptions {
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
  name: string
  server: Server

  constructor(
    server: Server,
    name: string,
    fn: MethodFunction,
    opts: MethodOptions,
  ) {
    const { cache, maxAge = 60000, schema } = opts ?? {}

    this.server = server
    this.name = name
    this.uuid = Presentation.uuid()
    this.isProtected = opts?.protected
    this.middleware = opts?.middleware
    this.fn = cache
      ? memoize(fn, {
          maxAge,
          normalizer: function ([params]) {
            return EJSON.stringify(params)
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
    const start = perf_hooks.performance.now()

    let cleanParams = params

    if (this.schema) {
      try {
        if (this.schema instanceof ObjectSchema) {
          await this.schema.validate(params)

          cleanParams = this.schema.cast(params, { stripUnknown: true })
        }
      } catch (error) {
        console.error(error)
        throw new SchemaValidationError(Errors.INVALID_PARAMS)
      }
    }

    let result = await this.runMiddleware(cleanParams, node)

    result = await HeleneAsyncLocalStorage.run(
      { executionId: Presentation.uuid(), context: node.context },
      async () => this.fn.call(node, result),
    )

    const end = perf_hooks.performance.now()

    this.server.emit(ServerEvents.METHOD_EXECUTION, {
      method: this.name,
      time: end - start,
      params: cleanParams,
      result,
    })

    return result
  }
}

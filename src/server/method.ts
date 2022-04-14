import memoize from 'memoizee'
import { ClientNode } from './client-node'
import { Presentation } from './presentation'
import Ajv, { AnySchemaObject, ValidateFunction } from 'ajv'
import { Errors, SchemaValidationError } from '../errors'

export type MethodParams = any
export type MethodFunction = (this: ClientNode, params?: MethodParams) => any

export interface MethodOptions {
  ns?: string
  cache?: boolean
  maxAge?: number
  protected?: boolean
  middleware?: Function[]
  schema?: AnySchemaObject
}

export class Method {
  uuid: string
  fn: MethodFunction
  isProtected: boolean
  middleware: Function[]
  validate: ValidateFunction = null

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

    this.setSchema(schema)
  }

  private setSchema(schema) {
    if (schema) {
      this.validate = new Ajv().compile(schema)
    }
  }

  async runMiddleware(params: MethodParams, node?: ClientNode) {
    if (!this.middleware) return

    for (const middleware of this.middleware) {
      const caller = middleware.call(node, params)

      caller instanceof Promise ? await caller : caller
    }
  }

  async exec(params: MethodParams, node?: ClientNode) {
    await this.runMiddleware(params, node)

    if (!this.validate || this.validate(params)) {
      return this.fn.call(node, params)
    } else {
      throw new SchemaValidationError(Errors.INVALID_PARAMS, this.validate.errors)
    }
  }
}

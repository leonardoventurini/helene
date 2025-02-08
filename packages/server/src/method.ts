import {
  AnyFunction,
  Errors,
  intercept,
  MethodParams,
  Presentation,
  SchemaValidationError,
  ServerEvents,
} from '@helenejs/utils'
import { EJSON } from 'ejson2'
import isEmpty from 'lodash/isEmpty'
import perf_hooks from 'perf_hooks'
import { AnyObjectSchema, ObjectSchema } from 'yup'
import { z } from 'zod'
import { ClientNode } from './client-node'
import { HeleneAsyncLocalStorage } from './helene-async-local-storage'
import { Server } from './server'

export type MethodFunction<T = any, R = any> = (
  this: ClientNode,
  params?: MethodParams<T>,
) => Promise<R> | R

/**
 * @todo Add support for timeout monitoring.
 */
export interface MethodOptions<Schema extends z.ZodUndefined | z.ZodTypeAny> {
  cache?: boolean
  maxAge?: number
  protected?: boolean
  middleware?: AnyFunction[]
  schema?: Schema | AnyObjectSchema
}

interface MemoizeOptions {
  maxAge?: number
}

function customMemoize<T extends (...args: any[]) => any>(
  fn: T,
  options: MemoizeOptions = {},
): T {
  const cache = new Map<string, { value: any; timestamp: number }>()
  const { maxAge = 60000 } = options

  return function (this: any, ...args: Parameters<T>): ReturnType<T> {
    const key = EJSON.stringify(args[0]) // Normalize first argument (params)
    const now = Date.now()
    const cached = cache.get(key)

    if (cached && now - cached.timestamp < maxAge) {
      return cached.value
    }

    const result = fn.apply(this, args)
    cache.set(key, { value: result, timestamp: now })
    return result
  } as T
}

export class Method<Schema extends z.ZodUndefined | z.ZodTypeAny, Result> {
  uuid: string
  fn: MethodFunction
  isProtected: boolean
  middleware: AnyFunction[]
  schema: AnyObjectSchema | z.ZodSchema | null = null
  name: string
  server: Server

  constructor(
    server: Server,
    name: string,
    fn: MethodFunction<z.input<Schema>, Result>,
    opts: MethodOptions<Schema>,
  ) {
    const { cache, maxAge = 60000, schema } = opts ?? {}

    this.server = server
    this.name = name
    this.uuid = Presentation.uuid()
    this.isProtected = opts?.protected
    this.middleware = opts?.middleware
    this.fn = cache ? customMemoize(fn, { maxAge }) : fn

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

        if (isZodSchema(this.schema)) {
          await this.schema.parseAsync(params)

          cleanParams = this.schema.parse(params)
        }
      } catch (error) {
        console.error(error)
        throw new SchemaValidationError(Errors.INVALID_PARAMS)
      }
    }

    const result = await HeleneAsyncLocalStorage.run(
      { executionId: Presentation.uuid(), context: node.context },
      async () => {
        const middlewareResult = await this.runMiddleware(cleanParams, node)

        return this.fn.call(node, middlewareResult)
      },
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

function isZodSchema(schema: unknown): schema is z.ZodType {
  if (!schema || typeof schema !== 'object') {
    return false
  }

  return (
    '_def' in schema &&
    'parse' in schema &&
    typeof (schema as z.ZodType).parse === 'function' &&
    'safeParse' in schema &&
    typeof (schema as z.ZodType).safeParse === 'function'
  )
}

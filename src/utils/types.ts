import type { z } from 'zod'

export type AnyFunction = (...args: any[]) => any | Promise<any>

export type ServerMethodDefinition<
  Schema extends z.ZodTypeAny | z.ZodUndefined = z.ZodUndefined,
  Result = any,
> = (
  params: Schema extends z.ZodUndefined ? CallOptions | void : z.input<Schema>,
  options: Schema extends z.ZodUndefined ? void : CallOptions | void,
) => Promise<Result>

export type ServerMethods = {
  [key: string]: ServerMethodDefinition
}

export type MethodParams<T = any> = T

export type CallOptions = {
  http?: boolean
  timeout?: number
  httpFallback?: boolean
  ignoreInit?: boolean
  maxRetries?: number
  delayBetweenRetriesMs?: number
}

import type { z } from 'zod'

export type AnyFunction = (...args: any[]) => any | Promise<any>

export type ServerMethodDefinition<
  Schema extends z.ZodTypeAny | z.ZodUndefined = z.ZodUndefined,
  Result = any,
> = {
  schema?: Schema
  fn: (
    schema: Schema extends z.ZodUndefined ? void : z.input<Schema>,
  ) => Promise<Result>
}

export type ServerMethods = {
  [key: string]: ServerMethodDefinition
}

export type MethodParams<T = any> = T

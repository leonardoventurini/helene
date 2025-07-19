import { ServerMethodDefinition, ServerMethods } from '../utils'
import { z } from 'zod'
import { MethodFunction, MethodOptions } from './method'

export function ns<
  Namespace extends string | undefined = undefined,
  Methods extends ServerMethods = ServerMethods,
>(namespace?: Namespace, submodules?: Methods) {
  function add<
    Name extends string,
    Schema extends z.ZodUndefined | z.ZodTypeAny,
    ResultType,
  >(
    methodName: Name,
    fn: MethodFunction<z.input<Schema>, ResultType>,
    options?: MethodOptions<Schema>,
  ): ReturnType<
    typeof ns<
      Namespace,
      Methods & {
        [K in Name]: ServerMethodDefinition<Schema, ResultType>
      }
    >
  >

  function add<Name extends string, NestedNamespace extends ServerMethods>(
    name: Name,
    nested: NestedNamespace,
  ): ReturnType<
    typeof ns<Namespace, Methods & { [K in Name]: NestedNamespace }>
  >

  function add<
    Name extends string,
    Schema extends z.ZodUndefined | z.ZodTypeAny,
    ResultType,
  >(
    methodName: Name,
    fnOrSubmodule: MethodFunction<z.input<Schema>, ResultType> | ServerMethods,
    options?: MethodOptions<Schema>,
  ) {
    const isMethodFunction = (
      value: MethodFunction<z.input<Schema>, ResultType> | ServerMethods,
    ): value is MethodFunction<z.input<Schema>, ResultType> => {
      return typeof value === 'function'
    }

    if (isMethodFunction(fnOrSubmodule)) {
      const nameWithPrefix = namespace
        ? `${namespace}.${methodName}`
        : methodName
      return ns<
        Namespace,
        Methods & Record<Name, ServerMethodDefinition<Schema, ResultType>>
      >(namespace, {
        ...submodules,
        [nameWithPrefix]: [fnOrSubmodule, options],
      } as Methods & Record<Name, ServerMethodDefinition<Schema, ResultType>>)
    }

    return ns<Namespace, Methods & { [K in typeof methodName]: ServerMethods }>(
      namespace,
      {
        ...submodules,
        [methodName]: {
          ...(submodules?.[methodName] ?? {}),
          ...fnOrSubmodule,
        },
      } as Methods & {
        [K in typeof methodName]: typeof fnOrSubmodule
      },
    )
  }

  type MethodBlocks = [MethodFunction<any, any>, MethodOptions<any>]

  interface MethodDefinition {
    [key: string]: MethodBlocks | Record<string, MethodBlocks>
  }

  const registerMethods = (methods: MethodDefinition, prefix: string = '') => {
    Object.entries(methods).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        Helene.addMethod(prefix ? `${prefix}.${key}` : key, value[0], value[1])
        return
      }

      registerMethods(value, prefix ? `${prefix}.${key}` : key)
    })
  }

  const build = () => {
    return submodules as Methods
  }

  const register = () => {
    registerMethods(submodules as unknown as MethodDefinition)
    return submodules as Methods
  }

  return {
    add,
    build,
    submodules,
    register,
  }
}

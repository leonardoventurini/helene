import { ServerMethodDefinition, ServerMethods } from '@helenejs/utils'
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
      Methods & Record<Name, ServerMethodDefinition<Schema, ResultType>>
    >
  >

  function add<Name extends string, T extends { submodules: ServerMethods }>(
    name: Name,
    submodule: T,
  ): ReturnType<
    typeof ns<Namespace, Methods & { [K in Name]: T['submodules'] }>
  >

  function add<
    Name extends string,
    Schema extends z.ZodUndefined | z.ZodTypeAny,
    ResultType,
    ChildMethods extends ServerMethods,
  >(
    methodName: Name,
    fnOrSubmodule:
      | MethodFunction<z.input<Schema>, ResultType>
      | ReturnType<typeof ns>,
    options?: MethodOptions<Schema>,
  ) {
    const isMethodFunction = (
      value:
        | MethodFunction<z.input<Schema>, ResultType>
        | ReturnType<typeof ns>,
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
      } as Methods &
        Record<Name, ServerMethodDefinition<z.input<Schema>, ResultType>>)
    }

    return ns<Namespace, Methods & { [K in typeof methodName]: ServerMethods }>(
      namespace,
      {
        ...submodules,
        [methodName]: fnOrSubmodule.submodules,
      } as Methods & {
        [K in typeof methodName]: typeof fnOrSubmodule.submodules
      },
    )
  }

  interface MethodDefinition {
    [key: string]:
      | [MethodFunction<any, any>, MethodOptions<any>]
      | MethodDefinition
  }

  const registerMethods = (methods: MethodDefinition, prefix: string = '') => {
    Object.entries(methods).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        console.log('registering method', prefix ? `${prefix}.${key}` : key)
        Helene.addMethod(prefix ? `${prefix}.${key}` : key, value[0], value[1])
        return
      }

      registerMethods(value, prefix ? `${prefix}.${key}` : key)
    })
  }

  const build = () => {
    console.log('submodules', submodules)

    registerMethods(submodules as MethodDefinition)

    return submodules as Methods
  }

  return {
    add,
    build,
    submodules,
  }
}

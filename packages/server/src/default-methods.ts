import { Methods } from '@helenejs/utils'
import { z } from 'zod'
import { Method } from './method'
import { listMethods, rpcInit, rpcLogout, rpcOff, rpcOn } from './methods'
import { Server } from './server'

type MethodBuilder<
  Schema extends z.ZodTypeAny | z.ZodUndefined = z.ZodUndefined,
  Result = any,
> = (server: Server, name: string) => Method<Schema, Result>

export const DefaultMethods: {
  [key: string]: MethodBuilder
} = {
  [Methods.LIST_METHODS]: listMethods,
  [Methods.RPC_ON]: rpcOn,
  [Methods.RPC_OFF]: rpcOff,
  [Methods.RPC_INIT]: rpcInit,
  [Methods.RPC_LOGOUT]: rpcLogout,
}

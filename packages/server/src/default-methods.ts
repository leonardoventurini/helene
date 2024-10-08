import { Method } from './method'
import { Server } from './server'
import { listMethods, rpcInit, rpcLogout, rpcOff, rpcOn } from './methods'
import { Methods } from '@helenejs/utils'

type MethodBuilder = (server: Server, name: string) => Method

export const DefaultMethods: {
  [key: string]: MethodBuilder
} = {
  [Methods.LIST_METHODS]: listMethods,
  [Methods.RPC_ON]: rpcOn,
  [Methods.RPC_OFF]: rpcOff,
  [Methods.RPC_INIT]: rpcInit,
  [Methods.RPC_LOGOUT]: rpcLogout,
}

import { Method } from './method'
import { Namespace } from './namespace'
import { Server } from './server'
import { keepAlive } from './methods/keep-alive'
import { listMethods } from './methods/list-methods'
import { rpcOn } from './methods/rpc-on'
import { rpcOff } from './methods/rpc-off'
import { rpcInit } from './methods/rpc-init'
import { rpcLogout } from './methods/rpc-logout'

export enum Methods {
  RPC_LOGIN = 'rpc:login',
  RPC_LOGOUT = 'rpc:logout',
  RPC_INIT = 'rpc:init',
  RPC_ON = 'rpc:on',
  RPC_OFF = 'rpc:off',
  LIST_METHODS = 'list:methods',
  KEEP_ALIVE = 'keep:alive',
}

type MethodBuilder = (server: Server, namespace: Namespace) => Method

export const DefaultMethods: {
  [key: string]: MethodBuilder
} = {
  [Methods.KEEP_ALIVE]: keepAlive,
  [Methods.LIST_METHODS]: listMethods,
  [Methods.RPC_ON]: rpcOn,
  [Methods.RPC_OFF]: rpcOff,
  [Methods.RPC_INIT]: rpcInit,
  [Methods.RPC_LOGOUT]: rpcLogout,
}

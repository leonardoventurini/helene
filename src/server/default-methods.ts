import { Method } from './method'
import { Server } from './server'
import {
  keepAlive,
  listMethods,
  rpcInit,
  rpcLogout,
  rpcOff,
  rpcOn,
} from './methods'
import { Methods } from '../utils'

type MethodBuilder = (server: Server) => Method

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

export * from './keep-alive'
export * from './list-methods'
export * from './rpc-init'
export * from './rpc-off'
export * from './rpc-on'
export * from './rpc-logout'
export * from './online-stats'

export enum Methods {
  RPC_LOGIN = 'rpc:login',
  RPC_LOGOUT = 'rpc:logout',
  RPC_INIT = 'rpc:init',
  RPC_ON = 'rpc:on',
  RPC_OFF = 'rpc:off',
  LIST_METHODS = 'list:methods',
  KEEP_ALIVE = 'keep:alive',
  ONLINE_STATS = 'online:stats',
}

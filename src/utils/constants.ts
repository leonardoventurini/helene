export enum HeleneEvents {
  METHOD_REFRESH = 'helene:method:refresh',
}

export enum WebSocketEvents {
  OPEN = 'open',
  MESSAGE = 'message',
  CONNECTION = 'connection',
  CLOSE = 'close',
  ERROR = 'error',
}

export enum ServerEvents {
  AUTHENTICATION = 'authentication',
  LOGOUT = 'logout',
  UPGRADE = 'upgrade',
  REQUEST = 'request',
  LISTENING = 'listening',
  CONNECTION = 'connection',
  DISCONNECTION = 'disconnection',
  DISCONNECT = 'disconnect',
  SOCKET_ERROR = 'socket:error',
  ERROR = 'error',
  REDIS_CONNECT = 'redis:connect',
  READY = 'ready',
}

export enum ClientEvents {
  LOGOUT = 'auth:logout',
  CLOSE = 'close',
  ERROR = 'error',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
  OPEN = 'open',
  MESSAGE = 'message',
  CONTEXT_CHANGED = 'context:changed',
  OUTBOUND_MESSAGE = 'outbound:message',
  INBOUND_MESSAGE = 'inbound:message',
  DEBUGGER = 'debugger',
  DISCONNECT = 'disconnect',
  CONNECTING = 'connecting',
}

export enum RedisListeners {
  CONNECT = 'connect',
  EVENTS = 'events',
  MESSAGE = 'message',
}

export const HELENE_WS_PATH = '/helene-ws'

export const NO_CHANNEL = 'NO_CHANNEL'

export const TOKEN_HEADER_KEY = 'x-api-key'

export enum Methods {
  RPC_LOGIN = 'rpc:login',
  RPC_LOGOUT = 'rpc:logout',
  RPC_INIT = 'rpc:init',
  RPC_ON = 'rpc:on',
  RPC_OFF = 'rpc:off',
  LIST_METHODS = 'list:methods',
  KEEP_ALIVE = 'keep:alive',
}
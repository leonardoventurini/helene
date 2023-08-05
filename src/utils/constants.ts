export enum HeleneEvents {
  METHOD_REFRESH = 'helene:method:refresh',
  KEEP_ALIVE = 'keep:alive',
  KEEP_ALIVE_DISCONNECT = 'keep:alive:disconnect',
  SERVER_SENT_EVENTS_CONNECTED = 'server:sent:events:connected',
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
  METHOD_EXECUTION = 'method:execution',
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
  CONNECTED = 'connected',

  WEBSOCKET_CONNECT_ATTEMPT = 'websocket:connect:attempt',
  WEBSOCKET_CONNECTED = 'websocket:connected',
  WEBSOCKET_ATTEMPT = 'websocket:attempt',
  WEBSOCKET_CLOSED = 'websocket:closed',
  WEBSOCKET_BACKOFF = 'websocket:backoff',
  WEBSOCKET_BACKOFF_READY = 'websocket:backoff:ready',
  WEBSOCKET_BACKOFF_FAIL = 'websocket:backoff:fail',
  WEBSOCKET_BACKOFF_RESET = 'websocket:backoff:reset',

  EVENTSOURCE_CREATE = 'eventsource:create',
  EVENTSOURCE_OPEN = 'eventsource:open',
  EVENTSOURCE_ERROR = 'eventsource:error',
}

export enum WebSocketEvent {
  OPEN = 'open',
  CLOSE = 'close',
  MESSAGE = 'message',
  ERROR = 'error',
}

export enum BackoffEvent {
  READY = 'ready',
  BACKOFF = 'backoff',
  FAIL = 'fail',
}

export enum RedisListeners {
  CONNECT = 'connect',
  EVENTS = 'events',
  MESSAGE = 'message',
}

export const HELENE_WS_PATH = '/helene-ws'

export const NO_CHANNEL = 'NO_CHANNEL'

export const CLIENT_ID_HEADER_KEY = 'x-client-id'
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

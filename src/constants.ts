export enum GlobalEvents {
  INSTANTIATED = 'helene:instantiated',
}

export enum WebSocketEvents {
  OPEN = 'open',
  MESSAGE = 'message',
  CONNECTION = 'connection',
  CLOSE = 'close',
  ERROR = 'error',
}

export enum ServerEvents {
  UPGRADE = 'upgrade',
  REQUEST = 'request',
  LISTENING = 'listening',
  CONNECTION = 'connection',
  DISCONNECTION = 'disconnection',
  SOCKET_ERROR = 'socket:error',
  ERROR = 'error',
  REDIS_CONNECT = 'redis:connect',
}

export enum ClientEvents {
  AUTH_CHANGED = 'auth:changed',
  CLOSE = 'close',
  ERROR = 'error',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
  OPEN = 'open',
  MESSAGE = 'message',
  CONTEXT_CHANGED = 'context:changed',
}

export enum RedisListeners {
  CONNECT = 'connect',
  EVENTS = 'events',
  MESSAGE = 'message',
}

export const DEFAULT_NAMESPACE = '/'

export const NO_CHANNEL = 'NO_CHANNEL'

export const TOKEN_HEADER_KEY = 'x-api-key'

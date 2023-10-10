export enum HeleneEvents {
  METHOD_REFRESH = 'helene:method:refresh',
  KEEP_ALIVE = 'keep:alive',
  KEEP_ALIVE_DISCONNECT = 'keep:alive:disconnect',
  SERVER_SENT_EVENTS_CONNECTED = 'server:sent:events:connected',
  EVENT_PROBE = 'event:probe',

  EVENT_PROBE_FAILED = 'event:probe:failed',

  COMMIT_PENDING_SUBSCRIPTIONS = 'commit:pending:subscriptions',
  COMMIT_PENDING_UNSUBSCRIPTIONS = 'commit:pending:unsubscriptions',
}

export enum WebSocketEvents {
  OPEN = 'open',
  MESSAGE = 'message',
  DATA = 'data',
  CONNECTION = 'connection',
  CLOSE = 'close',
  ERROR = 'error',
}

export enum ServerEvents {
  AUTHENTICATION = 'authentication',
  LOGOUT = 'logout',
  UPGRADE = 'upgrade',
  REQUEST = 'request',
  HTTP_LISTENING = 'http:listening',
  WEBSOCKET_LISTENING = 'websocket:listening',
  CONNECTION = 'connection',
  DISCONNECTION = 'disconnection',
  DISCONNECT = 'disconnect',
  SOCKET_ERROR = 'socket:error',
  ERROR = 'error',
  REDIS_CONNECT = 'redis:connect',
  READY = 'ready',
  METHOD_EXECUTION = 'method:execution',
  CLOSED = 'closed',
}

export enum ClientEvents {
  LOGOUT = 'auth:logout',
  ERROR = 'error',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
  CONTEXT_CHANGED = 'context:changed',
  OUTBOUND_MESSAGE = 'outbound:message',
  INBOUND_MESSAGE = 'inbound:message',
  CONNECTING = 'connecting',

  WEBSOCKET_CONNECT_ATTEMPT = 'websocket:connect:attempt',
  WEBSOCKET_CONNECTED = 'websocket:connected',
  WEBSOCKET_RECONNECTING = 'websocket:reconnecting',
  WEBSOCKET_CLOSED = 'websocket:closed',

  EVENTSOURCE_CREATE = 'eventsource:create',
  EVENTSOURCE_OPEN = 'eventsource:open',
  EVENTSOURCE_CLOSE = 'eventsource:close',
  EVENTSOURCE_ERROR = 'eventsource:error',

  CLOSE = 'client:close',
}

export enum ClientSocketEvent {
  DISCONNECT = 'disconnect',
}

export enum WebSocketState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export enum WebSocketEvent {
  OPEN = 'open',
  CLOSE = 'close',
  MESSAGE = 'message',
  ERROR = 'error',
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
  EVENT_PROBE = 'event:probe',
}

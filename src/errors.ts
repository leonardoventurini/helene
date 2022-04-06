export class PublicError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Helene Error'
  }
}

export enum Errors {
  PARSE_ERROR = 'Parse Error',
  INVALID_REQUEST = 'Invalid Request',
  METHOD_NOT_FOUND = 'Method Not Found',
  INVALID_PARAMS = 'Invalid Params',
  INTERNAL_ERROR = 'Internal Error',
  EVENT_NOT_PROVIDED = 'Event Not Provided',
  INVALID_RPC_VERSION = 'Invalid JSON RPC Version',
  PARAMS_NOT_FOUND = 'Params Not Found',
  METHOD_FORBIDDEN = 'Method Forbidden',
  EVENT_FORBIDDEN = 'Event Forbidden',
  INVALID_METHOD_NAME = 'Invalid Method Name',
  METHOD_NOT_SPECIFIED = 'Method Not Specified',
  SUBSCRIPTION_ERROR = 'Subscription Error',
  EVENT_NOT_FOUND = 'Event Not Found',
  EVENT_NOT_SUBSCRIBED = 'Event Not Subscribed',
  AUTHENTICATION_FAILED = 'Authentication Failed',
}

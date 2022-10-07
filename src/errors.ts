export class PublicError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Helene Error'
  }
}

export class SchemaValidationError extends Error {
  errors: string[]

  constructor(message: string, errors: string[]) {
    super(message)
    this.name = 'Schema Validation Error'
    this.errors = errors
  }
}

export enum Errors {
  AUTHENTICATION_FAILED = 'Authentication Failed',
  EVENT_FORBIDDEN = 'Event Forbidden',
  EVENT_NOT_FOUND = 'Event Not Found',
  EVENT_NOT_PROVIDED = 'Event Not Provided',
  EVENT_NOT_SUBSCRIBED = 'Event Not Subscribed',
  INTERNAL_ERROR = 'Internal Error',
  INVALID_METHOD_NAME = 'Invalid Method Name',
  INVALID_PARAMS = 'Invalid Params',
  INVALID_REQUEST = 'Invalid Request',
  INVALID_TOKEN = 'Invalid Token',
  METHOD_FORBIDDEN = 'Method Forbidden',
  METHOD_NOT_FOUND = 'Method Not Found',
  METHOD_NOT_SPECIFIED = 'Method Not Specified',
  PARAMS_NOT_FOUND = 'Params Not Found',
  PARSE_ERROR = 'Parse Error',
  SUBSCRIPTION_ERROR = 'Subscription Error',
  RATE_LIMIT_EXCEEDED = 'Rate Limit Exceeded',
}

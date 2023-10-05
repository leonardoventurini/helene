import { AsyncLocalStorage } from 'async_hooks'

/**
 * https://nodejs.org/api/async_context.html
 */
export const HeleneAsyncLocalStorage = new AsyncLocalStorage()

import { Backoff } from './backoff'
import { ExponentialBackoffStrategy } from './strategy/exponential'
import { FibonacciBackoffStrategy } from './strategy/fibonacci'
import { FunctionCall } from './function-call'

export {
  Backoff,
  FunctionCall,
  FibonacciBackoffStrategy as FibonacciStrategy,
  ExponentialBackoffStrategy as ExponentialStrategy,
}

export const fibonacci = options => {
  return new Backoff(new FibonacciBackoffStrategy(options))
}

export const exponential = options => {
  return new Backoff(new ExponentialBackoffStrategy(options))
}

export const call = (fn, ...args) => {
  const vargs = args.slice(0, args.length - 1)
  const callback = args[args.length - 1]
  return new FunctionCall(fn, vargs, callback)
}

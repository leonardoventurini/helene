import EventEmitter2 from 'eventemitter2'
import { FibonacciBackoffStrategy } from './strategy/fibonacci'
import { AnyFunction } from '../types'
import { Backoff } from './backoff'

export class FunctionCall extends EventEmitter2 {
  static State_ = {
    PENDING: 0,
    RUNNING: 1,
    COMPLETED: 2,
    ABORTED: 3,
  }

  static DEFAULT_RETRY_PREDICATE_ = err => true

  function_: AnyFunction
  arguments_: any[]
  callback_: AnyFunction
  lastResult_: any[]
  numRetries_: number
  backoff_: Backoff | null
  strategy_: FibonacciBackoffStrategy | null
  failAfter_: number
  retryPredicate_: (err: any) => boolean
  state_: number

  constructor(fn, args, callback) {
    super()

    this.function_ = fn
    this.arguments_ = args
    this.callback_ = callback
    this.lastResult_ = []
    this.numRetries_ = 0

    this.backoff_ = null
    this.strategy_ = null
    this.failAfter_ = -1
    this.retryPredicate_ = FunctionCall.DEFAULT_RETRY_PREDICATE_

    this.state_ = FunctionCall.State_.PENDING
  }

  isPending() {
    return this.state_ === FunctionCall.State_.PENDING
  }

  isRunning() {
    return this.state_ === FunctionCall.State_.RUNNING
  }

  isCompleted() {
    return this.state_ === FunctionCall.State_.COMPLETED
  }

  isAborted() {
    return this.state_ === FunctionCall.State_.ABORTED
  }

  setStrategy(strategy) {
    if (this.isPending()) {
      throw new Error('FunctionCall in progress.')
    }

    this.strategy_ = strategy
    return this
  }

  retryIf(retryPredicate) {
    this.retryPredicate_ = retryPredicate
    return this
  }

  getLastResult() {
    return this.lastResult_.concat()
  }

  getNumRetries() {
    return this.numRetries_
  }

  failAfter(maxNumberOfRetry) {
    this.failAfter_ = maxNumberOfRetry
    return this
  }

  abort() {
    if (this.isCompleted() || this.isAborted()) {
      return
    }

    if (this.isRunning()) {
      this.backoff_.reset()
    }

    this.state_ = FunctionCall.State_.ABORTED
    this.lastResult_ = [new Error('Backoff aborted.')]
    this.emit('abort')
    this.doCallback_()
  }

  start(backoffFactory) {
    if (this.isAborted()) {
      throw new Error('FunctionCall is aborted.')
    }

    if (this.isPending()) {
      throw new Error('FunctionCall already started.')
    }

    const strategy = this.strategy_ || new FibonacciBackoffStrategy()

    this.backoff_ = backoffFactory
      ? backoffFactory(strategy)
      : new Backoff(strategy)

    this.backoff_.on('ready', () => this.doCall_(true))
    this.backoff_.on('fail', () => this.doCallback_())
    this.backoff_.on('backoff', (number, delay, err) =>
      this.handleBackoff_(number, delay, err),
    )

    if (this.failAfter_ > 0) {
      this.backoff_.failAfter(this.failAfter_)
    }

    this.state_ = FunctionCall.State_.RUNNING
    this.doCall_(false)
  }

  doCall_(isRetry) {
    if (isRetry) {
      this.numRetries_++
    }

    this.emit('call', ...this.arguments_)

    const callback = (...args) => this.handleFunctionCallback_(...args)
    this.function_(...this.arguments_, callback)
  }

  doCallback_() {
    this.callback_(...this.lastResult_)
  }

  handleFunctionCallback_(...args) {
    if (this.isAborted()) {
      return
    }

    this.lastResult_ = args
    this.emit('callback', ...args)

    const err = args[0]
    if (err && this.retryPredicate_(err)) {
      this.backoff_.backoff(err)
    } else {
      this.state_ = FunctionCall.State_.COMPLETED
      this.doCallback_()
    }
  }

  handleBackoff_(number, delay, err) {
    this.emit('backoff', number, delay, err)
  }
}

import { BackoffStrategy } from './strategy'

export class FibonacciBackoffStrategy extends BackoffStrategy {
  backoffDelay_: number
  nextBackoffDelay_: number

  constructor(options?) {
    super(options)
    this.backoffDelay_ = 0
    this.nextBackoffDelay_ = this.getInitialDelay()
  }

  next_() {
    const backoffDelay = Math.min(this.nextBackoffDelay_, this.getMaxDelay())
    this.nextBackoffDelay_ += this.backoffDelay_
    this.backoffDelay_ = backoffDelay
    return backoffDelay
  }

  reset_() {
    this.nextBackoffDelay_ = this.getInitialDelay()
    this.backoffDelay_ = 0
  }
}

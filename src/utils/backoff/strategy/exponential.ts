import { BackoffStrategy } from './strategy'

export class ExponentialBackoffStrategy extends BackoffStrategy {
  static DEFAULT_FACTOR = 2

  backoffDelay_: number
  nextBackoffDelay_: number
  factor_: number

  constructor(options) {
    super(options)
    this.backoffDelay_ = 0
    this.nextBackoffDelay_ = this.getInitialDelay()
    this.factor_ = ExponentialBackoffStrategy.DEFAULT_FACTOR

    if (options && options.factor !== undefined) {
      this.factor_ = options.factor
    }
  }

  next_() {
    this.backoffDelay_ = Math.min(this.nextBackoffDelay_, this.getMaxDelay())
    this.nextBackoffDelay_ = this.backoffDelay_ * this.factor_
    return this.backoffDelay_
  }

  reset_() {
    this.backoffDelay_ = 0
    this.nextBackoffDelay_ = this.getInitialDelay()
  }
}

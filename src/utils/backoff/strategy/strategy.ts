const isDef = value => value !== undefined && value !== null

type Options = {
  initialDelay?: number
  maxDelay?: number
  randomisationFactor?: number
}

export class BackoffStrategy {
  initialDelay_: number
  maxDelay_: number
  randomisationFactor_: number

  constructor(options: Options = {}) {
    if (isDef(options.initialDelay) && options.initialDelay < 1) {
      throw new Error('The initial timeout must be greater than 0.')
    } else if (isDef(options.maxDelay) && options.maxDelay < 1) {
      throw new Error('The maximal timeout must be greater than 0.')
    }

    this.initialDelay_ = options.initialDelay || 100
    this.maxDelay_ = options.maxDelay || 10000

    if (this.maxDelay_ <= this.initialDelay_) {
      throw new Error(
        'The maximal backoff delay must be greater than the initial backoff delay.',
      )
    }

    if (
      isDef(options.randomisationFactor) &&
      (options.randomisationFactor < 0 || options.randomisationFactor > 1)
    ) {
      throw new Error('The randomisation factor must be between 0 and 1.')
    }

    this.randomisationFactor_ = options.randomisationFactor || 0
  }

  getMaxDelay() {
    return this.maxDelay_
  }

  next() {
    const backoffDelay = this.next_() as any
    const randomisationMultiple = 1 + Math.random() * this.randomisationFactor_
    return Math.round(backoffDelay * randomisationMultiple)
  }

  // Computes and returns the next backoff delay. Intended to be overridden by
  // subclasses.
  next_() {
    throw new Error('BackoffStrategy.next_() unimplemented.')
  }

  getInitialDelay() {
    return this.initialDelay_
  }

  reset() {
    this.reset_()
  }

  reset_() {
    throw new Error('BackoffStrategy.reset_() unimplemented.')
  }
}

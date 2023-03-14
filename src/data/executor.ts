/**
 * Responsible for sequentially executing actions on the database
 */

import async from 'async'
import { last } from 'lodash'

type Callback = (...args: any[]) => any

type Task = {
  this: any
  fn: Callback
  arguments: any[]
}

export class Executor {
  buffer: Task[]
  ready: boolean
  queue: async.QueueObject<Task>

  constructor() {
    this.buffer = []
    this.ready = false

    // This queue will execute all commands, one-by-one in order
    this.queue = async.queue(function (task: Task, queueCallback: Callback) {
      const newArguments = []

      // task.arguments is an array-like object on which adding a new field doesn't work, so we transform it into a real array
      for (let i = 0; i < task.arguments.length; i += 1) {
        newArguments.push(task.arguments[i])
      }

      const lastArg = last(task.arguments)

      // Always tell the queue task is complete. Execute callback if any was given.
      if (typeof lastArg === 'function') {
        // Callback was supplied
        newArguments[newArguments.length - 1] = function (...args) {
          lastArg(...args)

          if (typeof setImmediate === 'function') {
            setImmediate(queueCallback)
          } else {
            process.nextTick(queueCallback)
          }
        }
      } else if (!lastArg && task.arguments.length !== 0) {
        // false/undefined/null supplied as callbback
        newArguments[newArguments.length - 1] = function () {
          queueCallback()
        }
      } else {
        // Nothing supplied as callback
        newArguments.push(function () {
          queueCallback()
        })
      }

      task.fn.apply(task.this, newArguments)
    }, 1)
  }

  /**
   * If executor is ready, queue task (and process it immediately if executor was idle)
   * If not, buffer task for later processing
   * @param {Object} task
   *                 task.this - Object to use as this
   *                 task.fn - Function to execute
   *                 task.arguments - Array of arguments, IMPORTANT: only the last argument may be a function (the callback)
   *                                                                 and the last argument cannot be false/undefined/null
   * @param {Boolean} forceQueuing Optional (defaults to false) force executor to queue task even if it is not ready
   */
  push(task: Task, forceQueuing = false) {
    if (this.ready || forceQueuing) {
      this.queue.push(task)
    } else {
      this.buffer.push(task)
    }
  }

  /**
   * Queue all tasks in buffer (in the same order they came in)
   * Automatically sets executor as ready
   */
  processBuffer() {
    let i
    this.ready = true
    for (i = 0; i < this.buffer.length; i += 1) {
      this.queue.push(this.buffer[i])
    }
    this.buffer = []
  }
}

import { match } from './model'
import _ from 'lodash'

/**
 * Match any of the subqueries
 */
export const LogicalOperators = {
  $or: function (obj, query: any[]) {
    let i

    if (!Array.isArray(query)) {
      throw new Error('$or operator used without an array')
    }

    for (i = 0; i < query.length; i += 1) {
      if (match(obj, query[i])) {
        return true
      }
    }

    return false
  },
  /**
   * Match all the subqueries
   * @param obj
   * @param query
   */
  $and: function (obj, query: any[]) {
    let i

    if (!Array.isArray(query)) {
      throw new Error('$and operator used without an array')
    }

    for (i = 0; i < query.length; i += 1) {
      if (!match(obj, query[i])) {
        return false
      }
    }

    return true
  },
  /**
   * Match none of the subqueries
   */
  $not: function (obj, query) {
    return !match(obj, query)
  },

  /**
   * Match if the function returns true
   */
  $where: function (obj, fn) {
    if (!_.isFunction(fn)) {
      throw new Error('$where operator used without a function')
    }

    const result = fn.call(obj)

    if (!_.isBoolean(result)) {
      throw new Error('$where function must return boolean')
    }

    return result
  },
}

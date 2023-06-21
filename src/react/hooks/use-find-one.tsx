import { FindHookOptions, useFind } from './use-find'
import { first } from 'lodash'

export function useFindOne(options: Omit<FindHookOptions, 'limit'>) {
  const data = useFind({ ...options, limit: 1 })

  return first(data)
}

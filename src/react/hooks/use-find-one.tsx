import { useFind } from './use-find'
import { first } from 'lodash'
import { Collection } from '../../data'

export function useFindOne(
  collection: Collection,
  filter: Record<string, any>,
  sort?: Record<string, 1 | -1>,
  projection?: Record<string, 0 | 1>,
  skip?: number,
) {
  const data = useFind(collection, filter, sort, projection, 1, skip)

  return first(data)
}

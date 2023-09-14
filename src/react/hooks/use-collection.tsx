import useCreation from 'ahooks/lib/useCreation'
import { Collection, CollectionOptions } from '../../data'
import { useObject } from './use-object'

export function useCollection(options: CollectionOptions = {}) {
  const stableOptions = useObject(options)

  return useCreation(() => new Collection(options), [stableOptions])
}

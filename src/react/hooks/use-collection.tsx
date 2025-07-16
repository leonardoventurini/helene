import useCreation from 'ahooks/lib/useCreation'
import { useObject } from './use-object'
import { Collection, CollectionOptions } from '../../data'

export function useCollection(options: CollectionOptions = {}) {
  const stableOptions = useObject(options)

  return useCreation(() => new Collection(options), [stableOptions])
}

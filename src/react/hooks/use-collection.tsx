import { useCreation } from 'ahooks'
import { Collection, CollectionOptions } from '../../data'
import { useObject } from './use-object'

export function useCollection(options: CollectionOptions = {}) {
  const stableOptions = useObject(options)

  return useCreation(() => {
    return new Collection(options)
  }, [stableOptions])
}
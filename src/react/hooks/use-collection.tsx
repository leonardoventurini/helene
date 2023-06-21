import { useCreation } from 'ahooks'
import { Collection, CollectionOptions } from '../../data'
import { useObject } from './use-object'

export function useCollection(options: CollectionOptions = {}) {
  return useCreation(() => new Collection(options), [useObject(options)])
}

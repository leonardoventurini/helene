import { useCreation } from 'ahooks'

/**
 * The object will be recreated when any of its values changes, the quantity of values should not change.
 * @param obj
 */
export function useObject(obj: Record<string, any>) {
  return useCreation(() => obj, Object.values(obj))
}

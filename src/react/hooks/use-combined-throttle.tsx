import { Observable } from 'rxjs'
import { useEffect } from 'react'
import { useCreation } from 'ahooks'
import { mergeThrottle } from '../utils'

export function useCombinedThrottle({
  observables,
  throttle = 100,
  callback,
}: {
  observables: Observable<any>[]
  throttle?: number
  /**
   * Be sure to wrap your callback into `useCallback` hook
   */
  callback: (...args: any[]) => void
}) {
  const events$ = useCreation(
    () => mergeThrottle(...observables),
    [throttle, ...observables],
  )

  useEffect(() => {
    const subscription = events$.subscribe(callback)

    return () => {
      subscription.unsubscribe()
    }
  }, [callback, events$])
}

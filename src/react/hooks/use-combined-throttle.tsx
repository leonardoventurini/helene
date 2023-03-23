import { merge, Observable, throttleTime } from 'rxjs'
import { useEffect } from 'react'
import { useCreation } from 'ahooks'

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
    () =>
      merge(...observables).pipe(
        // Always needs to update the state on the trailing edge for updated values
        throttleTime(throttle, undefined, { trailing: true }),
      ),
    [throttle, ...observables],
  )

  useEffect(() => {
    const subscription = events$.subscribe(callback)

    return () => {
      subscription.unsubscribe()
    }
  }, [callback, events$])
}

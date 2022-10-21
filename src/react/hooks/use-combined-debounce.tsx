import { concat, debounceTime, Observable } from 'rxjs'
import { useEffect } from 'react'

export function useCombinedDebounce({
  observables,
  debounce = 100,
  callback,
}: {
  observables: Observable<any>[]
  debounce?: number
  /**
   * Be sure to wrap your callback into `useCallback` hook
   */
  callback: (...args: any[]) => void
}) {
  useEffect(() => {
    const events$ = concat(...observables).pipe(debounceTime(debounce))

    const subscription = events$.subscribe(callback)

    return () => {
      subscription.unsubscribe()
    }
  }, [callback, ...observables])
}

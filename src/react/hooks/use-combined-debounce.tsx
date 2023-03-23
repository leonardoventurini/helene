import { debounceTime, merge, Observable } from 'rxjs'
import { useEffect } from 'react'
import { useCreation } from 'ahooks'

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
  const events$ = useCreation(
    () => merge(...observables).pipe(debounceTime(debounce)),
    [debounce, ...observables],
  )

  useEffect(() => {
    const subscription = events$.subscribe(callback)

    return () => {
      subscription.unsubscribe()
    }
  }, [callback, events$])
}

import { useCallback, useEffect, useState } from 'react'
import { Subscription } from 'rxjs'

export function useObserverSubscribe(observer, callback, deps) {
  const [sub, setSub] = useState<Subscription>()

  const _callback = useCallback(callback, deps)

  useEffect(() => {
    if (!observer) {
      return
    }

    const subscription = observer.subscribe(_callback)

    setSub(subscription)

    return () => {
      subscription.unsubscribe()

      setSub(undefined)
    }
  }, [_callback, observer])

  return sub
}

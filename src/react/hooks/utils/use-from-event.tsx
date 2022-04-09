import { fromEvent } from 'rxjs'
import { useEffect, useRef } from 'react'

export function useFromEvent(
  emitter: any,
  event: string,
  callback: (value: unknown) => void,
) {
  const event$ = useRef(null)

  useEffect(() => {
    event$.current = fromEvent(emitter, event).subscribe(callback)
    return () => event$.current.unsubscribe()
  }, [])

  return event$.current
}

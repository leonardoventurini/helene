import { EMPTY, fromEvent } from 'rxjs'
import { useCreation } from 'ahooks'

export function useRawEventObservable(emitter: any, event: string) {
  return useCreation(
    () => (emitter ? fromEvent(emitter, event) : EMPTY),
    [emitter, event],
  )
}

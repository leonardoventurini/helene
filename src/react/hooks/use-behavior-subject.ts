import { useEffect, useState } from 'react'
import { BehaviorSubject } from 'rxjs'

export default function useBehaviorSubject<T>(
  subject: BehaviorSubject<T>,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(subject.getValue())

  const updateValue = (v: T) => {
    subject.next(v)
  }

  useEffect(() => {
    const subscription = subject.subscribe(v => {
      setValue(v)
    })

    return () => subscription.unsubscribe()
  }, [])

  return [value, updateValue]
}

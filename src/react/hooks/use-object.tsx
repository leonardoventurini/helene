import { useEffect, useRef, useState } from 'react'
import isEqual from 'lodash/isEqual'
import useCreation from 'ahooks/lib/useCreation'

export function useLastChangedTimestamp(obj) {
  const [timestamp, setTimestamp] = useState(Date.now())

  const previousObj = useRef(obj)

  useEffect(() => {
    if (!isEqual(previousObj.current, obj)) {
      previousObj.current = obj
      setTimestamp(Date.now())
    }
  }, [obj])

  return timestamp
}

export function useObject(currentObject: Record<string, any>) {
  const timestamp = useLastChangedTimestamp(currentObject)

  return useCreation(() => currentObject, [timestamp])
}

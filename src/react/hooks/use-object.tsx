import { useCreation } from 'ahooks'
import { useEffect, useRef, useState } from 'react'

/**
 * The following implementation does not break if the number of properties changes.
 * The property values should still not change unnecessarily.
 */
export function useObject(obj: Record<string, any>) {
  const previousEntries = useRef([])

  const entries = useCreation(() => Object.entries(obj), [obj])
  const [timestamp, setTimestamp] = useState(Date.now())

  useEffect(() => {
    if (entries.length !== previousEntries.current.length) {
      update()
      return
    }

    for (const [key, value] of previousEntries.current) {
      if (obj[key] !== value) {
        update()
        return
      }
    }

    function update() {
      setTimestamp(Date.now())
      previousEntries.current = entries
    }
  }, [entries])

  return useCreation(() => obj, [timestamp])
}

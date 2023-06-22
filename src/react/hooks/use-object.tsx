import { useCreation } from 'ahooks'
import { useEffect, useRef, useState } from 'react'
import { isArray, isPlainObject } from 'lodash'

/**
 * The following implementation does not break if the number of properties changes.
 * The property values should still not change unnecessarily.
 */
export function useObject(obj: Record<string, any>) {
  const previousEntries = useRef(null)

  const entries = useCreation(
    () => (isPlainObject(obj) ? Object.entries(obj) : []),
    [obj],
  )

  const [timestamp, setTimestamp] = useState(Date.now())

  function recursiveCompare(previous, currentObject) {
    for (const [key, value] of previous) {
      if (isArray(value)) {
        if (value.length !== currentObject[key]?.length) {
          return true
        }

        if (recursiveCompare(Object.entries(value), currentObject?.[key])) {
          return true
        }

        continue
      }

      if (isPlainObject(value)) {
        const previousEntries = Object.entries(value)
        const currentEntries = Object.entries(currentObject?.[key] ?? {})

        if (currentEntries.length !== previousEntries.length) {
          return true
        }

        if (recursiveCompare(previousEntries, currentObject?.[key])) {
          return true
        }

        continue
      }

      if (currentObject?.[key] !== value) {
        return true
      }
    }
  }

  useEffect(() => {
    // Nothing can change on the first run, so we just initialize the previous entries
    if (previousEntries.current === null) {
      previousEntries.current = entries
      return
    }

    if (entries.length !== previousEntries.current.length) {
      update()
      return
    }

    if (recursiveCompare(previousEntries.current, obj)) {
      update()
      return
    }

    function update() {
      const now = Date.now()
      setTimestamp(now)
      previousEntries.current = entries
    }
  }, [entries])

  return useCreation(() => obj, [timestamp])
}

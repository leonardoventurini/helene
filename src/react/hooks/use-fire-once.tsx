import React, { useCallback, useState } from 'react'

export function useFireOnce(callback, delay = 1000) {
  const [calledAt, setCalledAt] = useState(0)

  return useCallback(
    function (...args) {
      if (Date.now() - calledAt >= delay) {
        callback(...args)
        setCalledAt(Date.now())
      }
    },
    [calledAt, callback],
  )
}

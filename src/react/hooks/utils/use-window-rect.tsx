import { useEffect, useRef } from 'react'
import { useResize } from './use-resize'

export function useWindowRect() {
  const bodyRect = useRef({ width: 0, height: 0 })

  useEffect(() => {
    bodyRect.current = {
      width: window?.innerWidth ?? 0,
      height: window?.innerHeight ?? 0,
    }
  }, [])

  useResize(() => {
    bodyRect.current = {
      width: window?.innerWidth ?? 0,
      height: window?.innerHeight ?? 0,
    }
  })

  return bodyRect.current
}

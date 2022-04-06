/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useResize } from './use-resize'
import ResizeObserver from 'resize-observer-polyfill'

type Rect = Omit<DOMRect, 'toJSON'> & {
  remainingScreenHeight: number
}

export const useDimensions = ref => {
  const resizeObserverRef = useRef<ResizeObserver>(null)

  const [dimensions, setDimensions] = useState<Rect>({
    height: 0,
    width: 0,
    remainingScreenHeight: 0,
    x: 0,
    y: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  })

  const update = useCallback(() => {
    const rect: DOMRect = ref.current?.getBoundingClientRect() || {}

    setDimensions({
      ...rect?.toJSON?.(),
      remainingScreenHeight: window.innerHeight - rect.y,
    })
  }, [ref.current])

  useEffect(() => {
    let mounted = true

    if (!resizeObserverRef.current && ref.current) {
      resizeObserverRef.current = new ResizeObserver(() =>
        mounted ? update() : null,
      )
      resizeObserverRef.current.observe(ref.current.parentElement)
    }

    update()

    return () => {
      mounted = false
      resizeObserverRef.current = null
    }
  }, [ref.current, update])

  useResize(() => {
    update()
  })

  return dimensions
}

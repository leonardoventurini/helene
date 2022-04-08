import { useEffect } from 'react'

export const useResize = onResize => {
  useEffect(() => {
    let mounted = true

    const callback = () => (mounted ? onResize() : null)

    window.addEventListener('resize', callback)

    return () => {
      mounted = false
      window.removeEventListener('resize', callback)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

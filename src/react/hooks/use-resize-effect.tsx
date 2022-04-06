import { useEffect, useLayoutEffect, useState } from 'react'
import { Helpers } from '../../utils/helpers'

export const useResizeEffect = Helpers.isBrowser
  ? effect => {
      const [timestamp, setTimestamp] = useState(Date.now())

      const listener = () => setTimestamp(Date.now())

      useEffect(() => {
        if (!effect) throw new Error('No effect function.')

        window.addEventListener('resize', listener)

        return () => {
          window.removeEventListener('resize', listener)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      useLayoutEffect(effect, [timestamp, effect])
    }
  : // eslint-disable-next-line @typescript-eslint/no-empty-function
    () => {}

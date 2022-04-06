import { useCallback, useEffect, useState } from 'react'
import { useClient } from './use-client'
import { NO_CHANNEL } from '../../constants'
import { isString } from 'lodash'

export function useEvent(
  event: string,
  fn: (...args: any[]) => void,
  deps: any[] = [],
  { channel = NO_CHANNEL } = {},
) {
  const [ready, setReady] = useState(false)
  const client = useClient()
  const refreshCallback = useCallback(fn, deps)

  useEffect(() => setReady(false), [client, channel, event, refreshCallback])

  useEffect(() => {
    if (!event) return
    if (!client) return

    const ch = client.channel(channel)

    ch.subscribe(event)
      .then(result => {
        if (isString(result[event]))
          throw new Error(`[${event}] ${result[event]}`)
        ch.on(event, refreshCallback)
        setReady(true)
      })
      .catch(console.error)

    return () => {
      ch.off(event, refreshCallback)
      ch.unsubscribe(event).catch(console.error)
    }
  }, [client, channel, event, refreshCallback])

  return ready
}

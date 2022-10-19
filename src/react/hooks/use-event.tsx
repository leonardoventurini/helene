import { useCallback, useEffect, useState } from 'react'
import { useClient } from './use-client'
import { NO_CHANNEL } from '../../constants'
import { isString } from 'lodash'

export type UseEventParams = {
  event: string
  channel?: string
  subscribe?: boolean
  active?: boolean
}

export function useEvent(
  {
    event,
    channel = NO_CHANNEL,
    subscribe = false,
    active = true,
  }: UseEventParams,
  fn: (...args: any[]) => void,
  deps: any[] = [],
) {
  const [ready, setReady] = useState(false)
  const client = useClient()
  const refreshCallback = useCallback(fn, deps)

  useEffect(() => setReady(false), [client, channel, event, refreshCallback])

  useEffect(() => {
    if (!active) return
    if (!event) return
    if (!client) return
    if (!channel) return

    const ch = client.channel(channel)

    if (subscribe) {
      ch.subscribe(event)
        .then(result => {
          if (isString(result[event]))
            throw new Error(`[${event}] ${result[event]}`)
          ch.on(event, refreshCallback)
          setReady(true)
        })
        .catch(console.error)
    } else {
      ch.on(event, refreshCallback)
      setReady(true)
    }

    return () => {
      ch.off(event, refreshCallback)

      if (subscribe) {
        ch.unsubscribe(event).catch(console.error)
      }
    }
  }, [client, channel, event, refreshCallback])

  return ready
}

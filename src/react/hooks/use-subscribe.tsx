import { AnyFunction, NO_CHANNEL } from '../../utils'
import { useEffect, useState } from 'react'
import { useClient } from './use-client'
import { isString } from 'lodash'

type UseSubscribeParams = {
  event: string
  channel?: string
  active?: boolean
}

export function useSubscribe(
  { event, channel = NO_CHANNEL, active = true }: UseSubscribeParams,
  callback: AnyFunction = null,
  deps: any[] = [],
) {
  const client = useClient()
  const [ready, setReady] = useState(false)

  deps = [channel, event, active].concat(deps)

  useEffect(() => {
    if (!event) return
    if (!channel) return
    if (!active) return

    setReady(false)

    const ch = client.channel(channel)

    if (callback) ch.on(event, callback)

    ch.subscribe(event)
      .then(result => {
        if (isString(result[event]))
          throw new Error(`[${event}] ${result[event]}`)
        setReady(true)
      })
      .catch(console.error)

    return () => {
      if (callback) ch.off(event, callback)
    }
  }, deps)

  useEffect(
    () => () => {
      const ch = client.channel(channel)

      // Only unsubscribe if there are no other listeners
      if (!ch._events[event]?.length) {
        ch?.unsubscribe(event).catch(console.error)
      }
    },
    [event, channel],
  )

  return ready
}

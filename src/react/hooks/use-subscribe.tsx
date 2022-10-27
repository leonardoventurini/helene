import { NO_CHANNEL } from '../../constants'
import { useEffect, useRef, useState } from 'react'
import { useClient } from './use-client'
import { isString } from 'lodash'
import { ClientChannel } from '../../client/client-channel'

type UseSubscribeParams = {
  event: string
  channel?: string
  setup?: (ch: ClientChannel) => void
  teardown?: (ch: ClientChannel) => void
  deps?: any[]
  subscribe?: boolean
}

export function useSubscribe({
  event,
  channel = NO_CHANNEL,
  setup,
  teardown,
  subscribe = false,
  deps: _deps = [],
}: UseSubscribeParams) {
  const client = useClient()
  const [ready, setReady] = useState(false)
  const teardownRef = useRef(false)

  const deps = [channel, event, subscribe].concat(_deps)

  useEffect(() => {
    if (!event) return
    if (!channel) return

    setReady(false)

    const ch = client.channel(channel)

    if (subscribe) {
      ch.subscribe(event)
        .then(result => {
          if (isString(result[event]))
            throw new Error(`[${event}] ${result[event]}`)
          setup?.(ch)
          setReady(true)

          if (teardownRef.current) {
            teardown?.(ch)
          }
        })
        .catch(console.error)
    } else {
      setup?.(ch)
      setReady(true)
    }

    return () => {
      teardownRef.current = true
      teardown?.(ch)
    }
  }, deps)

  useEffect(
    () => () => {
      if (subscribe)
        client.channel(channel)?.unsubscribe(event).catch(console.error)
    },
    [event, channel, subscribe],
  )

  return ready
}

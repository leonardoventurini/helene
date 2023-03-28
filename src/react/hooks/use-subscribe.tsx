import { NO_CHANNEL } from '../../utils/constants'
import { useEffect, useState } from 'react'
import { useClient } from './use-client'
import { isString } from 'lodash'
import { ClientChannel } from '../../client/client-channel'

type UseSubscribeParams = {
  event: string
  channel?: string
  setup?: (ch: ClientChannel) => void
  teardown?: (ch: ClientChannel) => void
  deps?: any[]
  active?: boolean
}

export function useSubscribe({
  event,
  channel = NO_CHANNEL,
  setup,
  teardown,
  deps: _deps = [],
  active = true,
}: UseSubscribeParams) {
  const client = useClient()
  const [ready, setReady] = useState(false)

  const deps = [channel, event, setup, teardown].concat(_deps)

  useEffect(() => {
    if (!event) return
    if (!channel) return
    if (!active) return

    setReady(false)

    const ch = client.channel(channel)

    setup?.(ch)

    ch.subscribe(event)
      .then(result => {
        if (isString(result[event]))
          throw new Error(`[${event}] ${result[event]}`)
        setReady(true)
      })
      .catch(console.error)

    return () => {
      teardown?.(ch)
    }
  }, deps)

  useEffect(
    () => () => {
      client.channel(channel)?.unsubscribe(event).catch(console.error)
    },
    [event, channel],
  )

  return ready
}

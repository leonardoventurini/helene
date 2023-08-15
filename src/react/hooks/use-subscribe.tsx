import { AnyFunction, NO_CHANNEL } from '../../utils'
import { useEffect, useState } from 'react'
import { useClient } from './use-client'
import { isString } from 'lodash'
import { useCreation } from 'ahooks'

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
  if (!isString(event)) {
    throw new Error('event name is required')
  }

  if (!isString(channel)) {
    throw new Error('channel name is required')
  }

  const client = useClient()
  const [ready, setReady] = useState(false)

  const _channel = useCreation(() => client.channel(channel), [client, channel])

  useEffect(() => {
    if (!callback) return
    if (!active) return

    _channel.on(event, callback)

    return () => {
      _channel.off(event, callback)
    }
  }, [event, channel, callback, active].concat(deps))

  useEffect(() => {
    if (!active) return

    _channel
      .subscribe(event)
      .then(result => setReady(result[event]))
      .catch(console.error)

    return () => {
      // Prevent unsubscribing too early due to simple re-rendering
      setTimeout(() => {
        // Only unsubscribe if there are no other listeners
        if (!_channel._events[event]?.length) {
          _channel.unsubscribe(event).catch(console.error)
        }
      }, 1000)
    }
  }, [event, channel, active])

  return ready
}

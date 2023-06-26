import { useMethod } from 'helene/react'
import { isNumber } from 'lodash'

export function ConnectedNodes() {
  const { result: connections } = useMethod({
    method: 'connection.count',
    defaultValue: 0,
  })

  return (
    <div className='stats bg-base-200 shadow-lg'>
      <div className='stat'>
        <div className='stat-title'>Nodes Connected</div>
        <div className='stat-value'>
          {isNumber(connections) ? connections.toLocaleString() : 'N/A'}
        </div>
        <div className='stat-desc'>Number of clients connected right now</div>
      </div>
    </div>
  )
}

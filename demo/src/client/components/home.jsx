import { useMethod } from 'helene/react'
import hero from '../hero.jpg'
import React from 'react'

export const Home = () => {
  const { result: connections } = useMethod({
    method: 'connection.count',
  })

  return (
    <div className='p-4'>
      <img
        src={hero}
        alt='Helene'
        className='mx-auto mb-4 w-full max-w-[640px]'
      />
      <h1 className='text-center'>Delightful Real-time Apps for Node.js</h1>

      <p className='text-center'>Nodes Connected: {connections ?? 0}</p>
    </div>
  )
}

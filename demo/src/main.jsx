import React from 'react'
import { createRoot } from 'react-dom/client'
import './main.css'
import hero from './hero.jpg'
import { ClientProvider, useMethod } from 'helene/react'
import Intro from './pages/intro.mdx'

const App = () => {
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

createRoot(document.getElementById('app')).render(
  <ClientProvider
    clientOptions={{
      host: window.location.host,
      errorHandler: console.error,
      secure: window.location.protocol === 'https:',
    }}
  >
    <App />

    <div className='prose'>
      <Intro />
    </div>
  </ClientProvider>,
)

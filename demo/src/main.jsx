import React from 'react'
import { createRoot } from 'react-dom/client'
import './main.css'
import { ClientProvider } from 'helene/react'
import { Routes } from './routes.jsx'
import { BrowserRouter } from 'react-router-dom'

createRoot(document.getElementById('app')).render(
  <ClientProvider
    clientOptions={{
      host: window.location.host,
      errorHandler: console.error,
      secure: window.location.protocol === 'https:',
    }}
  >
    <BrowserRouter>
      <Routes />
    </BrowserRouter>
  </ClientProvider>,
)

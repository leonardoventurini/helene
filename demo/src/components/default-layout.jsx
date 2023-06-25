import React from 'react'
import { Navbar } from './navbar.jsx'
import { Sidebar } from './sidebar.jsx'

export function DefaultLayout({
  children,
  className = 'max-w-[1280px] prose',
}) {
  return (
    <div className='min-h-screen'>
      <Navbar />
      <div className='grid grid-cols-[14rem_1fr] gap-4'>
        <Sidebar />
        <section className={className}>{children}</section>
      </div>
    </div>
  )
}

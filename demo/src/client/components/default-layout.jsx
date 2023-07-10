import React from 'react'
import { Navbar } from './navbar.jsx'
import { Sidebar } from './sidebar.jsx'
import { Footer } from './footer.jsx'

export function DefaultLayout({
  children,
  className = 'max-w-[1280px] prose',
}) {
  return (
    <div className='flex min-h-screen flex-col'>
      <Navbar />
      <div className='mb-auto grid grid-cols-[14rem_1fr] gap-4'>
        <Sidebar />
        <section className={className}>{children}</section>
      </div>
      <Footer />
    </div>
  )
}

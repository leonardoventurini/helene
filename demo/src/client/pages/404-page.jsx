import React from 'react'

const PageNotFound = () => {
  return (
    <section>
      <div className='container mx-auto flex min-h-screen items-center px-6 py-12'>
        <div className='mx-auto flex max-w-sm flex-col items-center text-center'>
          <p className='rounded-full bg-blue-50 p-3 text-sm font-medium text-blue-500 dark:bg-gray-800'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              fill='none'
              viewBox='0 0 24 24'
              strokeWidth='2'
              stroke='currentColor'
              className='h-6 w-6'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z'
              />
            </svg>
          </p>
          <h1 className='mt-3 text-2xl font-semibold text-gray-800 dark:text-white md:text-3xl'>
            Page Not Found
          </h1>
        </div>
      </div>
    </section>
  )
}

export default PageNotFound

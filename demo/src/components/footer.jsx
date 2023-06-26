export function Footer() {
  return (
    <footer className='footer bg-neutral text-neutral-content mt-16 items-center justify-center p-8'>
      <div className='prose flex flex-col items-center'>
        <p className='m-0'>
          Released under the{' '}
          <a
            href='https://github.com/leonardoventurini/helene/blob/main/LICENSE'
            target='_blank'
            rel='noreferrer'
          >
            MIT License
          </a>
        </p>
        <p className='m-0'>
          Copyright © {new Date().getFullYear()} Leonardo Venturini &
          Contributors
        </p>
      </div>
    </footer>
  )
}

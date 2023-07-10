import { ReactComponent as Logo } from '../assets/logo.svg'
import { useTheme } from '../hooks/use-theme.jsx'
import { MoonStar, Sun } from 'lucide-react'

export function ThemeButton() {
  const theme = useTheme()

  return (
    <button onClick={theme.toggle} className='flex items-center gap-1.5'>
      {theme.isDark ? (
        <>
          <MoonStar className='h-4 w-4' /> Dark
        </>
      ) : (
        <>
          <Sun className='h-4 w-4' /> Light
        </>
      )}
    </button>
  )
}

export function Navbar() {
  return (
    <div className='navbar bg-base-100'>
      <div className='flex-1'>
        <a className='btn btn-ghost text-xl normal-case'>
          <Logo />
        </a>
      </div>
      <div className='flex-none'>
        <ul className='menu menu-horizontal gap-2 px-1'>
          <li>
            <a>Link</a>
          </li>
          <li>
            <details>
              <summary>Parent</summary>
              <ul className='bg-base-100 p-2'>
                <li>
                  <a>Link 1</a>
                </li>
                <li>
                  <a>Link 2</a>
                </li>
              </ul>
            </details>
          </li>
          <li>
            <ThemeButton />
          </li>
        </ul>
      </div>
    </div>
  )
}

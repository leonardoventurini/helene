import { ReactComponent as Logo } from '../assets/helene.svg'
import { useTheme } from '../hooks/use-theme.jsx'
import { MoonStar, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'

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
      <div className='ml-2.5 flex-1'>
        <Link to='/' className='text-xl normal-case'>
          <Logo height={32} width={128} />
        </Link>
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

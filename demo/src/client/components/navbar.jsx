import { ReactComponent as Logo } from '../assets/helene.svg'
import { useTheme } from '../hooks/use-theme.jsx'
import {
  Box,
  Bug,
  Github,
  Loader,
  Stars,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useGitHub } from '../hooks/use-github.jsx'

export function ThemeButton() {
  const theme = useTheme()

  return (
    <button onClick={theme.toggle} className='flex items-center gap-1.5'>
      {theme.isDark ? (
        <>
          Dark Mode <ToggleRight className='h-4 w-4' />
        </>
      ) : (
        <>
          Dark Mode <ToggleLeft className='h-4 w-4' />
        </>
      )}
    </button>
  )
}

export function Navbar() {
  const { data, loading } = useGitHub()

  return (
    <div className='navbar bg-base-100'>
      <div className='ml-2.5 flex-1'>
        <Link to='/' className='text-xl normal-case'>
          <Logo height={32} width={128} />
        </Link>
      </div>
      <div className='flex-none'>
        <ul className='menu menu-horizontal gap-2 px-1'>
          {loading ? (
            <Loader className='h-4 w-4 animate-spin self-center' />
          ) : (
            <>
              <li>
                <a
                  href='https://github.com/leonardoventurini/helene/stargazers'
                  target='_blank'
                  rel='noreferrer'
                >
                  <Stars className='h-4 w-4' />
                  {data?.stargazers_count || 0} stars
                </a>
              </li>
              <li>
                <a
                  href='https://github.com/leonardoventurini/helene/issues'
                  target='_blank'
                  rel='noreferrer'
                >
                  <Bug className='h-4 w-4' />
                  {data?.open_issues_count || 0} issues
                </a>
              </li>
            </>
          )}

          <li>
            <a
              href='https://github.com/leonardoventurini/helene'
              target='_blank'
              rel='noreferrer'
            >
              <Github className='h-4 w-4' />
              GitHub
            </a>
          </li>
          <li>
            <a
              href='https://www.npmjs.com/package/helene'
              target='_blank'
              rel='noreferrer'
            >
              <Box className='h-4 w-4' />
              NPM
            </a>
          </li>
          <li>
            <ThemeButton />
          </li>
        </ul>
      </div>
    </div>
  )
}

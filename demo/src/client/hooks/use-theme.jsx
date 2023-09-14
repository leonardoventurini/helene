import { useEffect } from 'react'
import { singletonHook } from 'react-singleton-hook'
import noop from 'lodash/noop'
import useLocalStorageState from 'ahooks/lib/useLocalStorageState'

export const useTheme = singletonHook(
  {
    theme: 'light',
    lightMode: noop,
    darkMode: noop,
    toggle: noop,
    loading: true,
    isDark: false,
    isLight: true,
  },
  () => {
    const [theme, setTheme] = useLocalStorageState('theme', {
      defaultValue: 'light',
    })

    useEffect(() => {
      if (theme === 'dark') {
        document.documentElement.classList.add('bp4-dark')
        document.documentElement.classList.add('dark')
        document.documentElement.dataset.theme = 'dark'
      } else {
        document.documentElement.classList.remove('bp4-dark')
        document.documentElement.classList.remove('dark')
        document.documentElement.dataset.theme = 'light'
      }
    }, [theme])

    return {
      theme,
      lightMode: () => setTheme('light'),
      darkMode: () => setTheme('dark'),
      toggle: () => setTheme(theme === 'light' ? 'dark' : 'light'),
      loading: false,
      isDark: theme === 'dark',
      isLight: theme === 'light',
    }
  },
)

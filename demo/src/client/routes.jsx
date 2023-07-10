import { Switch } from 'react-router-dom'
import Intro from './pages/intro.mdx'
import { LayoutRoute } from './components/layout-route.jsx'
import { useTheme } from './hooks/use-theme.jsx'

export function Routes() {
  useTheme()

  return (
    <Switch>
      <LayoutRoute path='/' component={Intro} />
    </Switch>
  )
}

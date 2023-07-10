import { Switch } from 'react-router-dom'
import Intro from './pages/intro.mdx'
import { LayoutRoute } from './components/layout-route.jsx'

export function Routes() {
  return (
    <Switch>
      <LayoutRoute path='/' component={Intro} />
    </Switch>
  )
}

import { Switch } from 'react-router-dom'
import { Home } from './components/home.jsx'
import Intro from './pages/intro.mdx'
import { LayoutRoute } from './components/layout-route.jsx'

export function Routes() {
  return (
    <Switch>
      <LayoutRoute path='/intro' component={Intro} />
      <LayoutRoute path='/' component={Home} />
    </Switch>
  )
}

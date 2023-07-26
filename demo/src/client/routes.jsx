import { Switch } from 'react-router-dom'
import Intro from './pages/intro.mdx'
import Installation from './pages/installation.mdx'
import Server from './pages/server.mdx'
import Client from './pages/client.mdx'
import Authentication from './pages/authentication.mdx'
import Methods from './pages/methods.mdx'
import Events from './pages/events.mdx'
import Channels from './pages/channels.mdx'
import Data from './pages/data.mdx'
import Provider from './pages/react/provider.mdx'
import UseClient from './pages/react/use-client.mdx'
import UseAuth from './pages/react/use-auth.mdx'
import UseEvent from './pages/react/use-event.mdx'
import UseConnectionState from './pages/react/use-connection-state.mdx'
import UseDepsChange from './pages/react/use-deps-change.mdx'
import UseMethod from './pages/react/use-method.mdx'
import Roadmap from './pages/roadmap.mdx'
import License from './pages/license.mdx'
import { LayoutRoute } from './components/layout-route.jsx'
import { useTheme } from './hooks/use-theme.jsx'

export function Routes() {
  useTheme()

  return (
    <Switch>
      <LayoutRoute path='/' component={Intro} />
      <LayoutRoute path='/installation' component={Installation} />
      <LayoutRoute path='/server' component={Server} />
      <LayoutRoute path='/client' component={Client} />
      <LayoutRoute path='/authentication' component={Authentication} />
      <LayoutRoute path='/methods' component={Methods} />
      <LayoutRoute path='/events' component={Events} />
      <LayoutRoute path='/channels' component={Channels} />
      <LayoutRoute path='/data' component={Data} />
      <LayoutRoute path='/react/provider' component={Provider} />
      <LayoutRoute path='/react/useClient' component={UseClient} />
      <LayoutRoute path='/react/useAuth' component={UseAuth} />
      <LayoutRoute path='/react/useEvent' component={UseEvent} />
      <LayoutRoute path='/react/useConnection' component={UseConnectionState} />
      <LayoutRoute path='/react/UseMethod' component={UseMethod} />
      <LayoutRoute path='/react/useDepsChange' component={UseDepsChange} />
      <LayoutRoute path='/roadmap' component={Roadmap} />
      <LayoutRoute path='/license' component={License} />
    </Switch>
  )
}

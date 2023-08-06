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
import React from './pages/react-intro.mdx'
import Provider from './pages/react/provider.mdx'
import UseClient from './pages/react/use-client.mdx'
import UseAuth from './pages/react/use-auth.mdx'
import UseConnectionState from './pages/react/use-connection-state.mdx'
import UseDepsChange from './pages/react/use-deps-change.mdx'
import UseMethod from './pages/react/use-method.mdx'
import Roadmap from './pages/roadmap.mdx'
import PageNotFound from './pages/404-page'
import { LayoutRoute } from './components/layout-route.jsx'
import { useTheme } from './hooks/use-theme.jsx'

import loadable from '@loadable/component'
import { Loader } from 'lucide-react'

export const fallback = <Loader className='h-8 w-8 animate-spin' />

export const load = path => loadable(() => path, { fallback })

export function Routes() {
  useTheme()

  return (
    <Switch>
      <LayoutRoute path='/' component={Intro} exact />
      <LayoutRoute path='/installation' component={Installation} />
      <LayoutRoute path='/server' component={Server} />
      <LayoutRoute path='/client' component={Client} />
      <LayoutRoute path='/authentication' component={Authentication} />
      <LayoutRoute path='/methods' component={Methods} />
      <LayoutRoute path='/events' component={Events} />
      <LayoutRoute path='/channels' component={Channels} />
      <LayoutRoute path='/data' component={Data} />
      <LayoutRoute path='/react-intro' component={React} />
      <LayoutRoute path='/react/provider' component={Provider} />
      <LayoutRoute path='/react/use-client' component={UseClient} />
      <LayoutRoute path='/react/use-auth' component={UseAuth} />
      <LayoutRoute
        path='/react/use-local-event'
        component={load(import('./pages/react/use-local-event.mdx'))}
      />
      <LayoutRoute
        path='/react/use-remote-event'
        component={load(import('./pages/react/use-remote-event.mdx'))}
      />
      <LayoutRoute
        path='/react/use-connection'
        component={UseConnectionState}
      />
      <LayoutRoute path='/react/use-method' component={UseMethod} />
      <LayoutRoute path='/react/use-deps-change' component={UseDepsChange} />
      <LayoutRoute path='/roadmap' component={Roadmap} />
      <LayoutRoute path='/' component={PageNotFound} />
    </Switch>
  )
}

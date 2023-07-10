import React from 'react'
import { Route } from 'react-router-dom'
import { DefaultLayout } from './default-layout.jsx'

export function LayoutRoute({
  component: Component,
  layout: Layout = DefaultLayout,
  ...rest
}) {
  return (
    <Route
      {...rest}
      render={props =>
        Layout ? (
          <Layout {...Component.layoutProps}>
            <Component {...props} />
          </Layout>
        ) : (
          <Component {...props} />
        )
      }
    />
  )
}

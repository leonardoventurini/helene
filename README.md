![Tests](https://github.com/leonardoventurini/helene/actions/workflows/test.yml/badge.svg)
![npm](https://img.shields.io/npm/v/helene?style=flat-square)
![GitHub](https://img.shields.io/github/license/leonardoventurini/helene?style=flat-square)
![GitHub watchers](https://img.shields.io/github/watchers/leonardoventurini/helene?style=social)
![GitHub Repo stars](https://img.shields.io/github/stars/leonardoventurini/helene?style=social)

<div style="text-align: center">
<h1>Helene <sup>Beta</sup></h1>
</div>

This package enables simple bidirectional real-time communication through WebSockets.

The goal of this package is to simplify the development of powerful applications through the use of an event driven architecture.

It is loosely based on Meteor methods and other RPC-like libraries.

Simple, easy.

> Please note that this is a `beta` version. The API is not stable and may change in the future.

<hr/>

## Table of Contents

- [Installation](#installation)
- [Server](#server)
- [Client](#client)
- [Authentication](#authentication)
- [Methods](#methods)
- [Events](#events)
- [Channels](#channels)
- [React](#issues)
  - [Provider](#provider)
  - [useClient Hook](#useclient-hook)
  - [useAuth Hook](#useauth-hook)
  - [useEvent Hook](#useevent-hook)
  - [useConnectionState Hook](#useconnectionstate-hook)
  - [useDepsChange Hook](#usedepschange-hook)
- [Roadmap](#roadmap)
- [License](#license)

## Installation

This module is distributed via [npm](https://www.npmjs.com/), commands:

```
npm install helene
```

or:

```
yarn add helene
```

This library has `peerDependencies` listings for `react` and `react-dom` version `18`.

## Server

You can create a new server instance like so:

```js
new Server({
  host: 'localhost',
  port: 80,
  redis: {
    // We use redis to propagate events to all containers in a cluster
    // This is the default value, you can omit this option
    url: 'redis://localhost:6379',
  },
  useRedis: true, // If you don't need redis, you can omit this option, false by default
})
```

The server will be globally available in Node as `Helene` so you can do something like this easily:

```js
Helene.addMethod(
  'hello',
  () => 'world')
```

## Client

The client allows interaction with the server, it works either in the browser or in other node instances.

The client can be created like so:

```js
const client = new Client({
  host: 'localhost',
  port: 80
})
```

It is not added to the global scope as you can have multiple clients.

## Authentication

You need a way to validate your token or whichever strategy you choose, and a way to generate it through the login method:

Please note that the user must be an object with an `_id` property that is either a `string` or an `ObjectId` from `mongoose`.

```js

server.setAuth({
  async auth({ token }) {
    // We fail the authentication by returning false.
    if (!isValid(token)) return false

    const user = await getUser(token)

    // Otherwise we return a context object.
    return { user }
  },
  async logIn({ username, password }) {
    const token = await Auth.login({ username, password})
  
    return { token }
  }
})
```

Then somewhere in the UI:

```js
await client.login({ username, password })
```

As you see this is completely agnostic, and you can set up your own authentication and login logic.



## Methods

First, you need to register a method:

```js
server.addMethod('helene:rocks', async () => 42)
```

Then you can call it from the client:

```js
const result = await client.call('helene:rocks') // 42
```

### Middleware

You can also use middleware functions which can be reused:

```js
server.addMethod('helene:rocks',
  async (...args) => ({ hello: true, ...args }), 
  { 
    middleware: [
      // You can also throw something in here to block execution.
      function(params) { return { world: true }}
    ]
  }
)

// { hello: true, world: true }
```

> If the middleware return primitives then the resulting primitive of each function will be passed down the next one until the main function receives the latest one as argument.

### Method Schema Validation

You can use a [Yup](https://www.npmjs.com/package/yup) schema to validate your method parameters:

```js
server.addMethod('validated:method', {
  schema: object({ foo: string().required() }),
})
```

The client method call will be rejected if the params fail to meet the schema requirements.

## Events

Events allow you to invert the control of the application by casting a piece of data to a set of clients.

You can group these clients in different ways by using channels.

Events need to be declared first:

```js
server.addEvent('event', { protected: false })
```

Then you can subscribe to it from the client:

```js
client.subscribe('event')
```

You can now listen to that event in the client app:

```js
client.on('event', console.log)
```

We can emit something from the server:

```js
server.emit('event', 42)
```

## Channels

It is possible to use multiple channels to better target an audience with events. 

In the server just use:

```js
server.channel('chat:1')
```

or chain it like so:

```js
server.channel('chat:1').addEvent('message')

server.channel('chat:1').emit('message', { 
  author: 'John Doe', 
  content: 'Hello World'
})
```

```js
await client.channel('chat:1').subscribe('message')
```

## React

Helene includes some helpful utilities and hooks for working with React.

### Provider

First you need to set up the client provider:

```jsx
<ClientProvider
  clientOptions={{
    host: 'localhost',
    port: 80,
    secure: true, // Use https or http
    errorHandler(error) {
      console.error(error)
    },
  }}
>
  ...
</ClientProvider>
```

Then you can use any of the hooks down the component tree.

### useClient Hook

Now you can have access to the client instance anywhere in your component tree

```jsx
const client = useClient()

await client.void('gather:metric')
```

### useAuth Hook

This hook allows you to tap into the authentication state and context

```jsx
const { authenticated, context, client, loading, ready } = useAuth()
```

### useEvent Hook

```jsx
useEvent(
  { event, channel, subscribe: true },
  value => console.log(value),
  [],
)
```

> This hook can be used both locally and subscribed to a server event.

### useConnectionState Hook

```jsx
const { isOnline, isOffline, isConnecting } = useConnectionState()
```

### useDepsChange Hook

Logs changes in hook deps, useful for debugging.

```jsx
useDepsChange(deps, { name: 'Hello World'})
```

## License

[MIT](LICENSE)

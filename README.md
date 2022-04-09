# Helene <sup>Beta</sup>

This package enables simple bidirectional real-time communication through WebSockets.

The goal of this package is to simplify the development of powerful applications through the use of an event driven architecture.

It is loosely based on Meteor methods and other RPC-like libraries.

Simple, easy.

- [Installation](#installation)
- [Server](#server)
- [Client](#client)
- [Authentication](#authentication)
- [Methods](#methods)
- [Events](#events)
- [Namespaces](#namespaces)
- [Channels](#channels)
- [React](#issues)
  - [Provider](#provider)
  - [useClient Hook](#useclient-hook)
  - [useAuth Hook](#useauth-hook)
  - [useEvent Hook](#useevent-hook)
- [Roadmap](#roadmap)
- [License](#license)

## Installation

This module is distributed via [npm](https://www.npmjs.com/), commands:

```
npm install helene
```

or

```
yarn add helene
```

This library has `peerDependencies` listings for `react` and `react-dom` version `17.0.2`.

## Server

You can create a new server instance like so:

```js
new Server({
  host: 'localhost',
  port: 80,
})
```

The server will be globally available in Node as `Helene` so you can do something like this easily:

```js
Helene.register('hello', () => 'world')
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

_It is not added to the global scope._

## Authentication

You need a way to validate your token or whichever strategy you choose, and a way to generate it through the login method.


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

Then somewhere in the UI

```js
await client.login({ username, password })
```

As you see this is completely agnostic, and you can set up your own authentication and login logic.



## Methods

First, you need to register a method

```js
server.register('helene:rocks', async () => 42)
```

Then you can call it from the client

```js
const result = await client.call('helene:rocks') // 42
```

You can also get the RxJS Observable version too

```js
const call$ = client.rCall('helene:rocks')

call$.subscribe(console.log)
```

## Events

Events allow you to invert the control of the application by casting a piece of data to a set of clients.

You can group these clients in different ways by using namespaces and channels.

Events need to be declared first

```js
server.events.add('event', { protected: false })
```

Then you can subscribe to it from the client

```js
client.subscribe('event')
```

You can now listen to that even in the client app

```js
client.on('event', console.log)
```

We can emit something from the server

```js
server.emit('event', 42)
```

## Namespaces

Namespaces allow you to group users of different sections of your application.

Methods and events are scoped to each namespace.

Every server instance has a default namespace and channel.

```js
const namespace = server.of('chat')

ns.events.add('message')

// This is the same as before
ns.channel('chat:1').events.add('message')

ns.channel('chat:1').emit('message', 'Hello World')
```

## Channels

It is possible to use multiple channels to better target an audience with events. 

In the server just use

```js
server.channel('chat:1')
```

or chain it like so

```js
server.channel('chat:1').events.add('message')

server.channel('chat:1').emit('message', { 
  author: 'John Doe', 
  content: 'Hello World'
})
```

It differs from namespace in that it can be switched mid-flight and share the namespace methods.


```js
await client.channel('chat:1').subscribe('message')
```

## React

Helene includes some helpful utilities and hooks for working with React.

### Provider

First you need to set up the client provider

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
  event,
  value => console.log(value),
  [],
)
```

## Roadmap

- RxJS integration
- Method schema validation
- Better method mixin system
- Improved safety and DDoS protection

## LICENSE

[MIT](LICENSE)

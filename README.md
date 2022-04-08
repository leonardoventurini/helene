# Helene <sup>Beta</sup>
This package enables simple real-time client-server communication through WebSockets.

The goal of this package is to simplify the development of powerful applications through the use of RPC-like features. 

It is loosely based on Meteor methods and other RPC-like libraries.

Simple, easy.

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

### Methods

The main entity in this framework is the method with it you can have client-to-server interaction.

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

First you need to set up an authentication function when you first instance the server:

```js
new Server({
  host: 'localhost',
  port: 80,
  async auth({ token }) {
    // We fail the authentication by returning false.
    if (!isValid(token)) return false

    const user = await getUser(token)
    
    // Otherwise we return a context object.
    return { user }
  }  
})
```

Then you need to generate a token upon login that will be used to authenticate the user

```js
Helene.setLogIn(async ({ username, password }) => {
  const token = await Auth.login({ username, password})
  
  return { token }
})
```

Then somewhere in the UI


```js
await client.login({ username, password })
```

As you see this is completely agnostic, and you can set up your own authentication and log in logic.

## Namespaces

Namespaces allow you group different types of audiences and methods, it can contain multiple channels and needs to have a different client connection (no in-flight hotswap).

## Methods

First you need to register a method

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

## Channels

It is possible to use multiple channels to better target an audience with events. 

In the server just use

```js
server.channel('chat:cf1c3390-b755-11ec-b909-0242ac120002')
```

or chain it like so

```js
server.channel('chat:cf1c3390-b755-11ec-b909-0242ac120002').events.add('message')

server.channel('chat:cf1c3390-b755-11ec-b909-0242ac120002').emit('message', { 
  author: 'John Doe', 
  content: 'Hello World'
})
```

It differs from namespace in that it can be switched mid-flight and share the namespace methods.


```js
await client.channel('chat:cf1c3390-b755-11ec-b909-0242ac120002').subscribe('message')
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

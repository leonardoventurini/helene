## Helene

This package enables simple real-time client-server communication through WebSockets.

The goal of this package is to simplify the development of powerful applications through the use of RPC-like features. 

It is loosely based on Meteor methods.

### Server

You can create a new server instance like so:

```javascript
new Server({
  host: 'localhost',
  port: 80,
})
```

The server will be globally available in Node as `Helene` so you can do something like this easily:

```javascript
Helene.register('hello', () => 'world')
```


### Client

The client can be created like so:

```javascript
const client = new Client({
  host: 'localhost',
  port: 80
})
```

_It is not added to the global scope._

### Authentication

In order to allow users to authenticate into the server we need to set the login method with `server.setLogIn(...)` by passing a callback which will return the context required by our `auth(...)` function.

First you need to set up an authentication function when you first instance the server:

```javascript
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

```javascript
Helene.setLogIn(async ({ username, password }) => {
  const token = await Auth.login({ username, password})
  
  return { token }
})
```

Then somewhere in the UI


```javascript
await client.login({ username, password })
```

As you see this is completely agnostic, and you can set up your own authentication and log in logic.

### Namespaces

Namespaces allow you group different types of audiences and methods, it can contain multiple channels and needs to have a different client connection (no in-flight hotswap).

### Channels

It is possible to use multiple channels to better target an audience with events. In the server just use `server.channel(name)`, it will both 1. Instantiate a new channel if there isn't one; 2. Return its instance so you can interact with it. It differs from namespace in that it can be switched in-flight and share the namespace methods.

### Methods

You can register methods by calling the `server.register(...)` function and passing a callback which accepts a single parameter `object` or `array`. By default, the `this` context is the Client Node which holds the `socket`, `req`, and `res` objects when applicable, among other utility functions.


## React


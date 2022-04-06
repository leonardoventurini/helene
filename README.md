## Helene

This package powers real time client-server communication through WebSockets and non-real time communication through HTTP requests either as fallback or when it is best suited.

The goal of this package is to simplify the development of powerful applications through the use of RPC-like features.

### Authentication

In order to allow users to authenticate into the server we need to set the login method with `server.setLogIn(...)` by passing a callback which will return the context required by our `auth(...)` function.

### Namespaces

Namespaces allow you group different types of audiences and methods, it can contain multiple channels and needs to have a different client connection (no in-flight hotswap).

### Channels

It is possible to use multiple channels to better target an audience with events. In the server just use `server.channel(name)`, it will both 1. Instantiate a new channel if there isn't one; 2. Return its instance so you can interact with it. It differs from namespace in that it can be switched in-flight and share the namespace methods.

### Methods

You can register methods by calling the `server.register(...)` function and passing a callback which accepts a single parameter `object` or `array`. By default, the `this` context is the Client Node which holds the `socket`, `req`, and `res` objects when applicable, among other utility functions.

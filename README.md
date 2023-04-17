![Tests](https://github.com/leonardoventurini/helene/actions/workflows/test.yml/badge.svg)
![npm](https://img.shields.io/npm/v/helene?style=flat-square)
![GitHub](https://img.shields.io/github/license/leonardoventurini/helene?style=flat-square)
![GitHub watchers](https://img.shields.io/github/watchers/leonardoventurini/helene?style=social)
![GitHub Repo stars](https://img.shields.io/github/stars/leonardoventurini/helene?style=social)

<div align="center">
	<br>
	<div>
		<img src="https://raw.githubusercontent.com/leonardoventurini/helene/main/assets/ocean-sphere-header.jpg" width='60%' alt='Helene'>
	</div>
	<br>
	<br>
  <p>
    Delightful Real-time Apps for Node.js
  </p>
  <br>
	<br>
</div>


# Introduction

Get ready to build your next application with Helene. 

Faster, easier, and more powerful.

Great for fast prototypes, small projects, and large applications.

Powerful and flexible, **use your favorite tools with it**.

This package enables powerful bidirectional real-time communication through WebSockets using methods and events.

It supports authentication, channels, data persistence, middleware, React hooks and more.

Send events to a specific user, a group of users, or all users.

Authorize events to specific users or groups.

The client is isomorphic and can be used in the browser or in Node.

Have a problem or suggestion? [Open an issue](https://github.com/leonardoventurini/helene/issues/new)!


<hr/>

## Table of Contents

- [Installation](#installation)
- [Server](#server)
- [Client](#client)
- [Authentication](#authentication)
- [Methods](#methods)
- [Events](#events)
- [Channels](#channels)
- [Data](#data)
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

## Server

You can create a new server instance like so:

```js
new Server({
  host: 'localhost',
  port: 80,
  redis: {
    // We use redis to propagate events to all containers in a cluster
    // This is the default value, you can omit this option and simply pass `true`
    url: 'redis://localhost:6379',
  },
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
server.addMethod('validated:method', () => {}, {
  schema: object({ foo: string().required() }),
})
```

The client method call will be rejected if the params fail to meet the schema requirements.

### Protected Methods

You can protect methods so that only authenticated users can call them:

```js
server.addMethod('protected:method', function () {
  // By using a normal function you can access the `this` context which includes a powerful
  // ClientNode instance that you can use to access the `socket`, `req` or `res` of a request.
  //
  // It also allows you to do more advanced things specific to the client that called the method.
  //
  // It is also available in the `auth()` function so you can store more information in the 
  // connection after authentication, etc.
  
  console.log(this.userId)
  console.log(this.context)
}, { protected: true })
```

You can use `middlewares` to add more logic to the protected methods like permissions and so on.

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

## Data

You can use Helene Data to manage local data both in Node and in the browser using a syntax similar to that of MongoDB.

We don't support all the features of MongoDB and certainly there are differences, the goal is to make it easy to manage local data.

This is not intended to be a replacement for MongoDB or a DBS, but rather a way to manage local data at the application level, which can then be synchronized with your database.

> This implementation is based on the amazing [NeDB](https://github.com/louischatriot/nedb) which sadly is no longer maintained with some big changes. Our new API is entirely promise-based, and we made sure all code works in the browser and in Node.js.

The main Helene Data unit, intuitively, is the `Collection`:

```ts
import {
  BrowserStorage
} from 'helene/data/browser'
import {
  NodeStorage
} from 'helene/data/node'

// Memory Collection
const memoryCollection = await Helene.createCollection({ name: 'logs' })

// With Browser Storage (Local Storage)
const browserCollection = await Helene.createCollection({
  name: 'logs',
  storage: new BrowserStorage()
})

// With Node Storage (File System)
const nodeCollection = await Helene.createCollection({
  name: 'logs',
  storage: new NodeStorage()
})
```

### Inserting Data

```ts
// A single document
await collection.insert({
  name: 'John Doe',
  age: 42,
})

// Multiple documents
await collection.insert([
  { name: 'John Doe', age: 42 },
  { name: 'Jane Doe', age: 42 },
])
```

### Finding Data

```ts
// Find all documents
const all = await collection.find()

// Find a single document
const single = await collection.findOne({ name: 'John Doe' })

// Find all documents with age 42
const allWithAge42 = await collection.find({ age: 42 })
```

### Updating Data

```ts

// Update a single document
await collection.update({ name: 'John Doe' }, { $set: { age: 43 } })

// Update all documents with age 4
await collection.update({ age: 42 }, { $set: { age: 43 } }, { multi: true })
```

### Removing Data

```ts
// Remove a single document
await collection.remove({ age: 42 })

// Remove all documents
await collection.remove({}, { multi: true })
```

### Indexes

Indexes are a way to improve the performance of your queries.

```ts

// Create a normal index on the field "age"
await collection.ensureIndex({ fieldName: 'age' })

// Create a unique index on the field "name"
await collection.ensureIndex({ fieldName: 'name', unique: true })

// Create a sparse index on the field "age", which means it will index only 
// documents with the field "age" and ignore the ones which don't have it
await collection.ensureIndex({ fieldName: 'age', sparse: true })
```

We do not support compound indexes yet.

## React

Helene includes some helpful utilities and hooks for working with React. All react utilities are exported from the `helene/react` module.

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

### useLocalEvent Hook

```jsx
useLocalEvent(
  { event, channel },
  value => console.log(value),
  [],
)
```

### useRemoteEvent Hook

This hook will automatically subscribe to the event on the server.

```jsx
useRemoteEvent(
  { event, channel },
  value => console.log(value),
  [],
)
```

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

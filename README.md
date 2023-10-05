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
    Real-time Web Apps for Node.js and Bun
  </p>
  <p>
    <a href="https://helene.leonardoventurini.tech" target="_blank">📘 Documentation</a>
  </p>
  <br>
</div>

- ⚡️ **Real-time** - Helene is a real-time framework for Node.js, Bun and the browser.
- 🦾 **Event-driven** - Helene is event-driven, which means that it uses events to communicate between the server and the client.
- 🪝 **React Hooks** - Helene provides a set of React Hooks to easily integrate your React application with the server.
<hr/>

### Quickstart

```bash
bun add @helenejs/server @helenejs/client
```
```bash
npm install @helenejs/server @helenejs/client
```

### Core Packages

- [@helenejs/server](packages/server/README.md) - Create a Helene server in Node.js or Bun
- [@helenejs/client](packages/client/README.md) - Connect to your Helene server from the browser, Node.js or Bun
- [@helenejs/data](packages/data/README.md) - In-memory database for the browser, Node.js and Bun with syntax similar to MongoDB
- [@helenejs/react](packages/react/README.md) - A set of React hooks and utilities to easily integrate your React application with Helene
- [@helenejs/utils](packages/utils/README.md) - A set of utilities used by Helene or its extensions

---
```js
// server.js

import { createServer } from '@helenejs/server'

createServer({
  host: 'localhost',
  port: 3000,
})

// Methods

Helene.addMethod('hello', () => 'Hello World!')

// Events

Helene.addEvent('event')

Helene.addMethod('emit:event', () => {
  Helene.emit('event', { message: 'Hello World!' })
})
```

```js
// client.js

import { Client } from '@helenejs/client'

const client = new Client({
  host: 'localhost:3000',
})

// Methods

const result = await client.call('hello')

console.log(result) // Hello World!

// Events

await client.subscribe('event')

client.on('event', (data) => {
  console.log(data) // { message: 'Hello World!' }
})

await client.call('emit:event')
```

### Stats

![Alt](https://repobeats.axiom.co/api/embed/2a323b2903ef389fb1e55b4b49b97a7d455640bb.svg "Repobeats analytics image")

### License

[MIT](LICENSE)

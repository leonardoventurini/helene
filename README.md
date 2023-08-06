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
    Delightful Real-time Apps for Node.js and the Browser
  </p>
  <p>
    <a href="https://helene.leonardoventurini.tech">📘 Documentation</a>
  </p>
  <br>
</div>

- ⚡️ **Real-time** - Helene is a real-time framework for Node.js and the browser.
- 🦾 **Event-driven** - Helene is event-driven, which means that it uses events to communicate between the server and the client.
- 🪝 **React Hooks** - Helene provides a set of React Hooks to easily integrate your React application with the server.
<hr/>

### Quickstart

  ```bash
  npm install helene
  ```

```js
// server.js

import { createServer } from 'helene'

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

import { Client } from 'helene'

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

### License

[MIT](LICENSE)

import { resolve } from 'path'
import { createServer, ServerEvents } from 'helene'
import sirv from 'sirv'

const port = process.env.PORT || 3000

async function start() {
  const server = createServer({
    port,
    host: '0.0.0.0',
    rateLimit: {
      max: 120,
      window: 60 * 1000,
    },
  })

  const app = server.express

  if (process.env.NODE_ENV === 'production') {
    app.use(
      sirv(resolve(process.cwd(), `./src/client/dist`), {
        gzip: true,
        single: true,
        setHeaders: res => {
          res.setHeader('Cache-Control', 'no-store, max-age=0')
        },
      }),
    )
  } else {
    const { createServer: createViteServer } = await import('vite')

    const { middlewares } = await createViteServer({
      configFile: resolve(process.cwd(), './vite.config.mjs'),
      server: {
        middlewareMode: true,
      },
      optimizeDeps: {
        force: process.argv.includes('--force'),
      },
    })

    app.use(middlewares)
  }

  await server.isReady()

  Helene.addMethod('connection.count', function () {
    return this.server.allClients.size
  })

  Helene.on(ServerEvents.CONNECTION, () => {
    setTimeout(() => {
      Helene.refresh('connection.count')
    }, 1000) // Account for latency
  })

  Helene.on(ServerEvents.DISCONNECTION, () => {
    setTimeout(() => {
      Helene.refresh('connection.count')
    }, 1000) // Account for latency
  })
}

start().catch(console.error)

import { createServer as createViteServer } from 'vite'
import { dirname, resolve } from 'path'
import { readFileSync } from 'fs'
import { createServer, ServerEvents } from 'helene'
import sirv from 'sirv'
import { fileURLToPath } from 'url'

const port = process.env.PORT || 3000

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function start() {
  const server = createServer({
    port,
    host: 'localhost',
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
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
    })

    app.use(vite.middlewares)

    const indexHtmlPath = resolve(__dirname, '../client/index.html')
    const indexHtmlContent = readFileSync(indexHtmlPath, 'utf-8')

    app.use('*', async (req, res) => {
      const url = req.originalUrl

      try {
        const template = await vite.transformIndexHtml(
          url,
          indexHtmlContent.toString(),
        )
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template)
      } catch (e) {
        vite.ssrFixStacktrace(e)
        console.error(e.stack)
        res.status(500).end(e.message)
      }
    })
  }

  await server.isReady()

  console.log(`http://localhost:${port}`)

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

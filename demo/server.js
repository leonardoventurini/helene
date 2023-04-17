const { createServer: createViteServer } = require('vite')
const { resolve } = require('path')
const { readFileSync } = require('fs')
const { Server, ServerEvents } = require('helene')

const port = process.env.PORT || 5001

async function start() {
  const server = new Server({
    port,
    host: 'localhost',
    rateLimit: {
      max: 120,
      window: 60 * 1000,
    },
  })

  const app = server.express

  const vite = await createViteServer({
    server: { middlewareMode: true },
  })

  app.use(vite.middlewares)

  const indexHtmlPath = resolve(__dirname, 'src/index.html')
  const indexHtmlContent = readFileSync(indexHtmlPath, 'utf-8')

  app.use('*', async (req, res) => {
    const url = req.originalUrl
    try {
      const template = await vite.transformIndexHtml(url, indexHtmlContent)
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template)
    } catch (e) {
      vite.ssrFixStacktrace(e)
      console.error(e.stack)
      res.status(500).end(e.message)
    }
  })

  await server.isReady()

  Helene.addMethod('connection.count', function () {
    return this.server.allClients.size
  })

  Helene.on(ServerEvents.CONNECTION, () => {
    setTimeout(() => {
      Helene.refresh('connection.count')
    }, 100)
  })

  Helene.on(ServerEvents.DISCONNECTION, () => {
    setTimeout(() => {
      Helene.refresh('connection.count')
    }, 100)
  })
}

start().catch(console.error)

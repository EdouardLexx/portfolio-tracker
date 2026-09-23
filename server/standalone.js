import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createInterface } from 'node:readline'
import { app } from './api.js'
import embedded from '../build/embedded-assets.js'

// Never change: the browser stores the user's data per origin, so another port
// (or `localhost` instead of 127.0.0.1) would open on an empty portfolio.
const PORT = 4719
const ORIGIN = `http://127.0.0.1:${PORT}`

const assets = new Map(
  Object.entries(embedded).map(([path, { type, data }]) => [
    path,
    { type, body: Buffer.from(data, 'base64') },
  ])
)

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()
  const asset = assets.get(req.path === '/' ? '/index.html' : req.path)
  if (!asset) return next()
  res.set('Content-Type', asset.type)
  // Vite fingerprints everything under /assets; index.html must stay fresh
  // so a new version is picked up.
  res.set(
    'Cache-Control',
    req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
  )
  res.send(asset.body)
})

function openBrowser(url) {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]]
  // No browser available (headless machine): the URL is printed anyway.
  spawn(command, args, { stdio: 'ignore', detached: true })
    .on('error', () => {})
    .unref()
}

async function isAlreadyRunning() {
  try {
    const res = await fetch(`${ORIGIN}/api/health`, { signal: AbortSignal.timeout(2000) })
    return (await res.json()).app === 'portfolio-tracker'
  } catch {
    return false
  }
}

/** Keeps a double-clicked console window open long enough to read the error. */
function fail(message) {
  console.error(`\n  ${message}\n`)
  if (!process.stdin.isTTY) process.exit(1)
  console.error('  Appuyez sur Entrée pour fermer.')
  createInterface({ input: process.stdin }).once('line', () => process.exit(1))
}

const withBrowser = !process.argv.includes('--no-browser')
const server = createServer(app)

server.once('listening', () => {
  console.log(`
  Portefeuille est lancé : ${ORIGIN}

  Vos données restent dans votre navigateur, sur cet ordinateur.
  Fermez cette fenêtre pour arrêter l'application.
`)
  if (withBrowser) openBrowser(ORIGIN)
})

server.on('error', async (err) => {
  if (err.code !== 'EADDRINUSE') return fail(`Démarrage impossible : ${err.message}`)
  if (await isAlreadyRunning()) {
    console.log('\n  Portefeuille est déjà lancé : ouverture dans le navigateur.\n')
    if (withBrowser) openBrowser(ORIGIN)
    // Leave the opener time to start before this process goes away.
    setTimeout(() => process.exit(0), 1500)
    return
  }
  fail(`Le port ${PORT} est déjà utilisé par un autre programme.`)
})

// Loopback only, like the development server.
server.listen(PORT, '127.0.0.1')

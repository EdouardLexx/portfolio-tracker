// Vercel entry point of the quotes relay used by the online version (GitHub
// Pages). The same routes as the local server, with one addition: the page
// lives on another origin, so that origin, and only it, may call the relay.
import express from 'express'
import { app } from '../server/api.js'

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? 'https://edouardlexx.github.io')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
)

const relay = express()

relay.use((req, res, next) => {
  const origin = req.headers.origin
  // Browsers always send Origin across sites: another website is refused
  // here, before any call to Yahoo is made on its behalf.
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'origine non autorisée' })
  }
  if (origin) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Vary', 'Origin')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

relay.use(app)

export default relay

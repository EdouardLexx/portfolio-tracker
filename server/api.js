import express from 'express'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
})

// No CORS: the Vite dev server proxies /api, so the browser only ever makes
// same-origin requests. Allowing other origins would let any open website use
// this API.
const app = express()

const cache = new Map()
const CACHE_TTL = 60_000
const CACHE_MAX_ENTRIES = 5_000

/** Bounds every list parameter, so one request cannot fan out without limit. */
const MAX_ITEMS_PER_REQUEST = 100

async function cached(key, ttl, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() < hit.expires) return hit.value
  const value = await fn()
  if (cache.size >= CACHE_MAX_ENTRIES) sweepCache()
  cache.set(key, { expires: Date.now() + ttl, value })
  return value
}

/** Drops expired entries, then the oldest ones if the cache is still full. */
function sweepCache() {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (entry.expires <= now) cache.delete(key)
  }
  for (const key of cache.keys()) {
    if (cache.size < CACHE_MAX_ENTRIES) break
    cache.delete(key)
  }
}

function tooMany(res, list) {
  if (list.length <= MAX_ITEMS_PER_REQUEST) return false
  res.status(400).json({
    error: `au plus ${MAX_ITEMS_PER_REQUEST} éléments par requête`,
  })
  return true
}

/**
 * ISIN → Yahoo symbol. Needed because broker documents identify instruments
 * by ISIN and product name only, and names drift over time (a fund changing
 * issuer keeps its ISIN but not its name).
 */
/**
 * Share classes Yahoo's ISIN search does not index. Without these, a Class A
 * and a Class C line are indistinguishable from the product name alone.
 */
const ISIN_OVERRIDES = {
  US02079K3059: 'GOOGL',
  US02079K1079: 'GOOG',
}

/** "ALPHABET INC. CLASS A" → "ALPHABET INC": Yahoo matches plain names only. */
function cleanProductName(name) {
  return (name || '')
    .replace(/\bCLASS\s+[A-Z]\b/gi, '')
    .replace(/\b(INC|CORP|CORPORATION|PLC|SA|NV|AG|LTD)\b\.?/gi, (m) =>
      m.replace(/\./g, '')
    )
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

app.get('/api/resolve', async (req, res) => {
  try {
    const isins = req.query.isins?.split(',').filter(Boolean) || []
    let names = {}
    try {
      names = req.query.names ? JSON.parse(req.query.names) : {}
    } catch {
      names = {}
    }
    if (!isins.length) return res.json([])
    if (tooMany(res, isins)) return

    const results = await Promise.allSettled(
      isins.map((isin) =>
        cached(`resolve:${isin}`, 24 * 3600_000, async () => {
          if (ISIN_OVERRIDES[isin]) {
            const symbol = ISIN_OVERRIDES[isin]
            const q = await yahooFinance.quote(symbol).catch(() => null)
            return {
              isin,
              symbol,
              currency: q?.currency ?? null,
              name: q?.shortName || q?.longName || symbol,
            }
          }

          let found = await yahooFinance.search(isin, { quotesCount: 10 })
          let candidates = (found.quotes || []).filter((q) => q.symbol)

          // Yahoo does not index every ISIN; fall back to the product name.
          if (!candidates.length && names[isin]) {
            const cleaned = cleanProductName(names[isin])
            if (cleaned) {
              found = await yahooFinance.search(cleaned, { quotesCount: 10 })
              candidates = (found.quotes || []).filter(
                (q) => q.symbol && !q.symbol.includes('=')
              )
            }
          }

          // Prefer a real tradable listing over a mutual-fund mirror, and
          // Euronext Paris for French ISINs so PEA lines price in EUR.
          const score = (q) => {
            let s = 0
            if (q.quoteType === 'EQUITY') s += 3
            if (q.quoteType === 'ETF') s += 3
            if (q.quoteType === 'MUTUALFUND') s -= 2
            if (isin.startsWith('FR') && q.symbol.endsWith('.PA')) s += 4
            if (!isin.startsWith('FR') && !q.symbol.includes('.')) s += 2
            return s
          }
          const best = candidates.sort((a, b) => score(b) - score(a))[0]
          if (!best) return null

          let currency = null
          let name = best.shortname || best.longname || null
          try {
            const q = await yahooFinance.quote(best.symbol)
            currency = q?.currency ?? null
            name = q?.shortName || q?.longName || name
          } catch {
            /* symbol still usable without the extra detail */
          }

          return { isin, symbol: best.symbol, currency, name }
        })
      )
    )

    res.json(
      results
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter(Boolean)
    )
  } catch (err) {
    console.error('Error resolving ISINs:', err.message)
    res.status(500).json({ error: err.message })
  }
})

/**
 * Livret A rate, from the Caisse des Dépôts open data (it operates the
 * Livret A, so this is the reference source). The rate moves twice a year at
 * most, hence the long cache.
 */
app.get('/api/livret-a', async (req, res) => {
  try {
    const data = await cached('livretA', 24 * 3600_000, async () => {
      const url =
        'https://opendata.caissedesdepots.fr/api/explore/v2.1/catalog/datasets' +
        '/flux-et-taux-la-ldds-lep/records' +
        '?limit=1&order_by=date%20desc&select=date,tla_tldds_percent'

      const response = await fetch(url, {
        headers: { 'User-Agent': 'portfolio-tracker' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const json = await response.json()
      const row = json.results?.[0]
      if (!row?.tla_tldds_percent) throw new Error('taux absent de la réponse')

      return {
        rate: Math.round(row.tla_tldds_percent * 100) / 100,
        since: row.date,
      }
    })

    res.json(data)
  } catch (err) {
    console.error('Error fetching Livret A rate:', err.message)
    res.status(502).json({ error: err.message })
  }
})

app.get('/api/quotes', async (req, res) => {
  try {
    const symbols = req.query.symbols?.split(',') || []
    if (!symbols.length) return res.json([])
    if (tooMany(res, symbols)) return

    const results = await Promise.allSettled(
      symbols.map((s) =>
        cached(`quote:${s}`, CACHE_TTL, () => yahooFinance.quote(s))
      )
    )

    const quotes = results
      .map((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          const q = r.value
          return {
            symbol: symbols[i],
            price: q.regularMarketPrice,
            currency: q.currency,
            change: q.regularMarketChange,
            changePercent: q.regularMarketChangePercent,
            marketCap: q.marketCap,
            name: q.shortName || q.longName,
          }
        }
        return null
      })
      .filter(Boolean)

    res.json(quotes)
  } catch (err) {
    console.error('Error fetching quotes:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/history', async (req, res) => {
  try {
    const { symbol, from } = req.query
    if (!symbol) return res.status(400).json({ error: 'symbol required' })

    const period1 = from || '2024-01-01'
    const result = await cached(
      `chart:${symbol}:${period1}`,
      15 * 60_000,
      () => yahooFinance.chart(symbol, { period1, interval: '1d' })
    )

    const data = (result.quotes || [])
      .filter((d) => d.close != null)
      .map((d) => ({
        date: d.date.toISOString().split('T')[0],
        close: d.close,
        adjClose: d.adjclose ?? d.close,
      }))

    res.json(data)
  } catch (err) {
    console.error('Error fetching history:', err.message)
    res.status(500).json({ error: err.message })
  }
})

/**
 * Units of each currency per 1 EUR. EUR is always 1, so a portfolio that
 * holds only euro instruments needs no network call.
 */
app.get('/api/fx', async (req, res) => {
  try {
    const currencies = [
      ...new Set((req.query.currencies || '').split(',').filter(Boolean)),
    ]
    if (tooMany(res, currencies)) return
    const rates = { EUR: 1 }

    const wanted = currencies.filter((c) => c !== 'EUR')
    const results = await Promise.allSettled(
      wanted.map((c) =>
        cached(`fx:EUR${c}`, CACHE_TTL, () =>
          yahooFinance.quote(`EUR${c}=X`)
        )
      )
    )

    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value?.regularMarketPrice) {
        rates[wanted[i]] = r.value.regularMarketPrice
      }
    })

    res.json(rates)
  } catch (err) {
    console.error('Error fetching fx rates:', err.message)
    res.status(500).json({ error: err.message })
  }
})

/** Lets a second launch of the packaged app recognise an instance already running. */
app.get('/api/health', (req, res) => {
  res.json({ app: 'portfolio-tracker' })
})

export { app }

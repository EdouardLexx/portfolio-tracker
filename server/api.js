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

/**
 * Caches the promise, not its result: identical requests arriving together
 * (a page load asks for the same quote several times) share one Yahoo call.
 * A failure is dropped at once so the next request tries again.
 */
function cached(key, ttl, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() < hit.expires) return hit.value
  if (cache.size >= CACHE_MAX_ENTRIES) sweepCache()
  const value = retryOnce(fn)
  cache.set(key, { expires: Date.now() + ttl, value })
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key)
  })
  return value
}

/**
 * A dropped connection ("fetch failed") is usually gone a moment later; a
 * refusal from Yahoo (unknown symbol, quota) is not, and is not retried.
 */
async function retryOnce(fn) {
  try {
    return await fn()
  } catch (err) {
    const transient = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(
      `${err?.message} ${err?.cause?.code ?? ''}`
    )
    if (!transient) throw err
    await new Promise((resolve) => setTimeout(resolve, 500))
    return fn()
  }
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

// Yahoo symbols: letters, digits and . - ^ = (BTC-EUR, CW8.PA, ^GSPC, EURUSD=X).
const SYMBOL = /^[A-Za-z0-9.^=-]{1,20}$/
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/
const CURRENCY = /^[A-Za-z]{3}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * A comma-separated query parameter, keeping only well-formed items: one
 * malformed entry (a badly read statement) must not stop the others from
 * being priced. A repeated or missing parameter reads as empty.
 */
function listParam(value, pattern) {
  if (typeof value !== 'string') return []
  return value.split(',').filter((item) => pattern.test(item))
}

function tooMany(res, list) {
  if (list.length <= MAX_ITEMS_PER_REQUEST) return false
  res.status(400).json({
    error: `au plus ${MAX_ITEMS_PER_REQUEST} éléments par requête`,
  })
  return true
}

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

/**
 * ISIN → Yahoo symbol. Needed because broker documents identify instruments
 * by ISIN and product name only, and names drift over time (a fund changing
 * issuer keeps its ISIN but not its name).
 */
app.get('/api/resolve', async (req, res) => {
  try {
    const isins = listParam(req.query.isins, ISIN)
    let names = {}
    try {
      names = typeof req.query.names === 'string' ? JSON.parse(req.query.names) : {}
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
          if (!candidates.length && typeof names[isin] === 'string') {
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
    res.status(502).json({ error: err.message })
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
        signal: AbortSignal.timeout(10_000),
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
    const symbols = listParam(req.query.symbols, SYMBOL)
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
    res.status(502).json({ error: err.message })
  }
})

app.get('/api/history', async (req, res) => {
  try {
    const { symbol, from } = req.query
    if (typeof symbol !== 'string' || !SYMBOL.test(symbol)) {
      return res.status(400).json({ error: 'symbole invalide' })
    }
    if (from !== undefined && (typeof from !== 'string' || !DATE.test(from))) {
      return res.status(400).json({ error: 'date de début invalide' })
    }

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
    res.status(502).json({ error: err.message })
  }
})

/**
 * Units of each currency per 1 EUR. EUR is always 1, so a portfolio that
 * holds only euro instruments needs no network call.
 */
app.get('/api/fx', async (req, res) => {
  try {
    const currencies = [...new Set(listParam(req.query.currencies, CURRENCY))]
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
    res.status(502).json({ error: err.message })
  }
})

/**
 * Detail view of one instrument. Reuses the quote cache of /api/quotes: the
 * same Yahoo quote object carries the day's range, 52-week extremes, P/E and
 * the after-hours price.
 */
app.get('/api/instrument', async (req, res) => {
  const { symbol } = req.query
  if (typeof symbol !== 'string' || !SYMBOL.test(symbol)) {
    return res.status(400).json({ error: 'symbole invalide' })
  }
  try {
    const q = await cached(`quote:${symbol}`, CACHE_TTL, () => yahooFinance.quote(symbol))
    if (!q) return res.status(404).json({ error: 'symbole inconnu' })
    res.json({
      symbol,
      name: q.longName || q.shortName || symbol,
      exchange: q.fullExchangeName ?? null,
      timezone: q.exchangeTimezoneName ?? 'UTC',
      quoteType: q.quoteType ?? null,
      marketState: q.marketState ?? null,
      currency: q.currency ?? 'EUR',
      price: q.regularMarketPrice ?? null,
      change: q.regularMarketChange ?? null,
      changePercent: q.regularMarketChangePercent ?? null,
      time: q.regularMarketTime ?? null,
      previousClose: q.regularMarketPreviousClose ?? null,
      open: q.regularMarketOpen ?? null,
      dayHigh: q.regularMarketDayHigh ?? null,
      dayLow: q.regularMarketDayLow ?? null,
      volume: q.regularMarketVolume ?? null,
      averageVolume: q.averageDailyVolume3Month ?? null,
      marketCap: q.marketCap ?? null,
      trailingPE: q.trailingPE ?? null,
      dividendYield: q.dividendYield ?? null,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
      postMarketPrice: q.postMarketPrice ?? null,
      postMarketChange: q.postMarketChange ?? null,
      postMarketChangePercent: q.postMarketChangePercent ?? null,
      postMarketTime: q.postMarketTime ?? null,
    })
  } catch (err) {
    console.error('Error fetching instrument:', err.message)
    res.status(502).json({ error: err.message })
  }
})

/**
 * How far back and how finely each range of the detail chart looks. "1d" and
 * "5d" fetch a few extra days so the last sessions are there even after a
 * weekend or a holiday; the client keeps the sessions it needs.
 */
const CHART_RANGES = {
  '1d': { days: 6, interval: '5m', prePost: true, ttl: 60_000 },
  '5d': { days: 12, interval: '15m', prePost: false, ttl: 5 * 60_000 },
  '1mo': { days: 31, interval: '60m', prePost: false, ttl: 15 * 60_000 },
  '6mo': { days: 183, interval: '1d', prePost: false, ttl: 60 * 60_000 },
  ytd: { days: null, interval: '1d', prePost: false, ttl: 60 * 60_000 },
  '1y': { days: 366, interval: '1d', prePost: false, ttl: 60 * 60_000 },
  '5y': { days: 1827, interval: '1wk', prePost: false, ttl: 6 * 3600_000 },
  max: { days: 40000, interval: '1mo', prePost: false, ttl: 6 * 3600_000 },
}

app.get('/api/chart', async (req, res) => {
  const { symbol, range } = req.query
  const spec = CHART_RANGES[range]
  if (typeof symbol !== 'string' || !SYMBOL.test(symbol) || !spec) {
    return res.status(400).json({ error: 'symbole ou période invalide' })
  }
  try {
    const now = new Date()
    const period1 =
      spec.days == null
        ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
        : new Date(now.getTime() - spec.days * 86_400_000)
    const result = await cached(`ichart:${symbol}:${range}`, spec.ttl, () =>
      yahooFinance.chart(symbol, {
        period1,
        interval: spec.interval,
        includePrePost: spec.prePost,
      })
    )
    const meta = result.meta ?? {}
    const regular = meta.currentTradingPeriod?.regular
    const post = meta.currentTradingPeriod?.post
    res.json({
      timezone: meta.exchangeTimezoneName ?? 'UTC',
      instrumentType: meta.instrumentType ?? null,
      gmtoffset: meta.gmtoffset ?? 0,
      regularStart: regular?.start ?? null,
      regularEnd: regular?.end ?? null,
      postEnd: post?.end ?? null,
      points: (result.quotes || [])
        .filter((q) => q.close != null)
        .map((q) => ({ t: new Date(q.date).getTime(), close: q.close })),
    })
  } catch (err) {
    console.error('Error fetching chart:', err.message)
    res.status(502).json({ error: err.message })
  }
})

/** Lets a second launch of the packaged app recognise an instance already running. */
app.get('/api/health', (req, res) => {
  res.json({ app: 'portfolio-tracker' })
})

export { app }

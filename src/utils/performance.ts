import type { HistoricalPrice, Transaction, SymbolInfo } from '../types'

export interface PerformancePoint {
  date: string
  portfolio: number
  sp500: number | null
  nasdaq100: number | null
}

export interface PerformanceDiagnostics {
  /** Days the portfolio could not be valued (a holding had no price yet). */
  skippedDays: string[]
  /** Cash flows still waiting to be netted out, if any remain at the end. */
  unappliedCashFlow: number
  /** Daily moves beyond the threshold, to spot artefacts. */
  outliers: { date: string; changePercent: number }[]
  pointCount: number
}

export interface PerformanceResult {
  series: PerformancePoint[]
  diagnostics: PerformanceDiagnostics
}

export interface PerformanceInput {
  transactions: Transaction[]
  history: Record<string, HistoricalPrice[]>
  fxHistory: Record<string, HistoricalPrice[]>
  spHistory: HistoricalPrice[]
  ndxHistory: HistoricalPrice[]
  rates: Record<string, number>
  symbols: Record<string, SymbolInfo>
  startDate?: string
}

/** Last value at or before `date`, so a closed market does not blank a day. */
function carryForward(history: HistoricalPrice[]): (date: string) => number | null {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
  let cursor = 0
  let last: number | null = null
  return (date: string) => {
    while (cursor < sorted.length && sorted[cursor].date <= date) {
      last = sorted[cursor].close
      cursor++
    }
    return last
  }
}

/**
 * Time-weighted return: daily returns chained with contributions netted out,
 * so the curve shows performance rather than how much was paid in.
 */
export function computePerformance({
  transactions,
  history,
  fxHistory,
  spHistory,
  ndxHistory,
  rates,
  symbols,
  startDate = '1900-01-01',
}: PerformanceInput): PerformanceResult {
  const empty: PerformanceResult = {
    series: [],
    diagnostics: {
      skippedDays: [],
      unappliedCashFlow: 0,
      outliers: [],
      pointCount: 0,
    },
  }
  if (!transactions.length || !Object.keys(history).length) return empty

  const priced = new Set(
    Object.entries(history)
      .filter(([, h]) => h.length > 0)
      .map(([ticker]) => ticker)
  )

  const tickerOf = (tx: Transaction) => tx.symbol ?? symbols[tx.isin]?.symbol

  const currencyByTicker = new Map<string, string>()
  for (const info of Object.values(symbols)) {
    currencyByTicker.set(info.symbol, info.currency || 'EUR')
  }
  for (const tx of transactions) {
    if (tx.symbol) currencyByTicker.set(tx.symbol, 'EUR')
  }

  const txsByDate = new Map<
    string,
    { ticker: string; qty: number; costEUR: number }[]
  >()
  for (const tx of transactions) {
    const ticker = tickerOf(tx)
    if (!ticker || !priced.has(ticker)) continue
    if (!txsByDate.has(tx.date)) txsByDate.set(tx.date, [])
    txsByDate.get(tx.date)!.push({
      ticker,
      qty: tx.quantity,
      costEUR: tx.amountEUR,
    })
  }

  const priceMap = new Map<string, Map<string, number>>()
  for (const [ticker, hist] of Object.entries(history)) {
    priceMap.set(ticker, new Map(hist.map((d) => [d.date, d.close])))
  }
  const fxMap = new Map<string, Map<string, number>>()
  for (const [currency, hist] of Object.entries(fxHistory)) {
    fxMap.set(currency, new Map(hist.map((d) => [d.date, d.close])))
  }

  // Benchmarks carry forward: a US holiday must not drop a day on which the
  // portfolio itself traded, because that day's purchases would be lost.
  const spAt = carryForward(spHistory)
  const ndxAt = carryForward(ndxHistory)

  const allDates = new Set<string>()
  Object.values(history).forEach((h) => h.forEach((d) => allDates.add(d.date)))
  spHistory.forEach((d) => allDates.add(d.date))
  transactions.forEach((t) => allDates.add(t.date))
  const sortedDates = [...allDates].sort()

  const holdings: Record<string, number> = {}
  const lastPrice: Record<string, number> = {}
  const lastFx: Record<string, number> = {}

  const raw: { date: string; twr: number; value: number }[] = []
  const skippedDays: string[] = []
  let cumulative = 1
  let prevValue: number | null = null
  // Carried so a day that cannot be valued does not swallow its purchases.
  let pendingCashFlow = 0

  for (const date of sortedDates) {
    const dayTxs = txsByDate.get(date)
    if (dayTxs) {
      pendingCashFlow += dayTxs.reduce((s, t) => s + t.costEUR, 0)
      for (const t of dayTxs) {
        holdings[t.ticker] = (holdings[t.ticker] || 0) + t.qty
      }
    }

    const held = Object.keys(holdings).filter((t) => holdings[t] !== 0)
    if (!held.length) continue

    let value = 0
    let complete = true
    for (const ticker of held) {
      const price = priceMap.get(ticker)?.get(date) ?? lastPrice[ticker]
      if (price == null) {
        complete = false
        break
      }

      const currency = currencyByTicker.get(ticker) ?? 'EUR'
      let fx = 1
      if (currency !== 'EUR') {
        fx =
          fxMap.get(currency)?.get(date) ??
          lastFx[currency] ??
          rates[currency] ??
          0
        if (!fx) {
          complete = false
          break
        }
      }
      value += (holdings[ticker] * price) / fx
    }

    if (!complete) {
      skippedDays.push(date)
      continue
    }

    // Only commit the carried prices once the whole day valued cleanly.
    for (const ticker of held) {
      const price = priceMap.get(ticker)?.get(date)
      if (price != null) lastPrice[ticker] = price
      const currency = currencyByTicker.get(ticker) ?? 'EUR'
      if (currency !== 'EUR') {
        const fx = fxMap.get(currency)?.get(date)
        if (fx) lastFx[currency] = fx
      }
    }

    if (prevValue !== null && prevValue > 0) {
      const dailyReturn = (value - pendingCashFlow) / prevValue
      if (Number.isFinite(dailyReturn) && dailyReturn > 0) {
        cumulative *= dailyReturn
      }
    }
    pendingCashFlow = 0
    prevValue = value

    raw.push({ date, twr: cumulative, value })
  }

  const windowed = raw.filter((p) => p.date >= startDate)
  if (!windowed.length) {
    return {
      ...empty,
      diagnostics: {
        skippedDays,
        unappliedCashFlow: pendingCashFlow,
        outliers: [],
        pointCount: 0,
      },
    }
  }

  const twrBase = windowed[0].twr
  const spBase = spAt(windowed[0].date)
  const ndxBase = ndxAt(windowed[0].date)

  const spLookup = carryForward(spHistory)
  const ndxLookup = carryForward(ndxHistory)

  const series: PerformancePoint[] = windowed.map((p) => {
    const sp = spLookup(p.date)
    const ndx = ndxLookup(p.date)
    return {
      date: p.date,
      portfolio: Math.round((p.twr / twrBase - 1) * 10000) / 100,
      sp500: sp != null && spBase ? Math.round((sp / spBase - 1) * 10000) / 100 : null,
      nasdaq100:
        ndx != null && ndxBase
          ? Math.round((ndx / ndxBase - 1) * 10000) / 100
          : null,
    }
  })

  const outliers: { date: string; changePercent: number }[] = []
  for (let i = 1; i < series.length; i++) {
    const change = series[i].portfolio - series[i - 1].portfolio
    if (Math.abs(change) > 12) {
      outliers.push({ date: series[i].date, changePercent: change })
    }
  }

  return {
    series,
    diagnostics: {
      skippedDays,
      unappliedCashFlow: pendingCashFlow,
      outliers,
      pointCount: series.length,
    },
  }
}

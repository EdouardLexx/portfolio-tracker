import type { HistoricalPrice, Transaction, SymbolInfo } from '../types'
import { SAVINGS_KINDS } from '../types'

export interface WealthPoint {
  date: string
  total: number
  money: number
}

export type Period = 'YTD' | '1Y' | '5Y' | 'ALL'

/**
 * Daily value of everything held: priced holdings at each close, converted to
 * euros at that day's rate, plus the money sitting in savings and cash.
 */
export function buildWealthSeries(
  transactions: Transaction[],
  history: Record<string, HistoricalPrice[]>,
  fxHistory: Record<string, HistoricalPrice[]>,
  rates: Record<string, number>,
  symbols: Record<string, SymbolInfo>
): WealthPoint[] {
  if (!transactions.length) return []

  const tickerOf = (tx: Transaction) => tx.symbol ?? symbols[tx.isin]?.symbol
  const priced = new Set(
    Object.entries(history)
      .filter(([, h]) => h.length > 0)
      .map(([ticker]) => ticker)
  )

  const currencyByTicker = new Map<string, string>()
  for (const info of Object.values(symbols)) {
    currencyByTicker.set(info.symbol, info.currency || 'EUR')
  }
  for (const tx of transactions) {
    if (tx.symbol) currencyByTicker.set(tx.symbol, 'EUR')
  }

  // Savings and cash have no market price: they are simply money held, and
  // their balance moves only when a deposit or interest lands.
  const moneyByDate = new Map<string, number>()
  const sharesByDate = new Map<string, { ticker: string; qty: number }[]>()

  for (const tx of transactions) {
    if (SAVINGS_KINDS.includes(tx.account)) {
      const delta = tx.amountEUR + (tx.interestEUR ?? 0)
      moneyByDate.set(tx.date, (moneyByDate.get(tx.date) ?? 0) + delta)
      continue
    }
    const ticker = tickerOf(tx)
    if (!ticker || !priced.has(ticker)) continue
    if (!sharesByDate.has(tx.date)) sharesByDate.set(tx.date, [])
    sharesByDate.get(tx.date)!.push({ ticker, qty: tx.quantity })
  }

  const priceMap = new Map<string, Map<string, number>>()
  for (const [ticker, h] of Object.entries(history)) {
    priceMap.set(ticker, new Map(h.map((d) => [d.date, d.close])))
  }
  const fxMap = new Map<string, Map<string, number>>()
  for (const [currency, h] of Object.entries(fxHistory)) {
    fxMap.set(currency, new Map(h.map((d) => [d.date, d.close])))
  }

  const dates = new Set<string>()
  Object.values(history).forEach((h) => h.forEach((d) => dates.add(d.date)))
  transactions.forEach((t) => dates.add(t.date))
  const sorted = [...dates].sort()

  const firstDate = transactions.map((t) => t.date).sort()[0]

  const holdings: Record<string, number> = {}
  const lastPrice: Record<string, number> = {}
  const lastFx: Record<string, number> = {}
  let money = 0

  const series: WealthPoint[] = []

  for (const date of sorted) {
    if (date < firstDate) continue

    money += moneyByDate.get(date) ?? 0
    for (const s of sharesByDate.get(date) ?? []) {
      holdings[s.ticker] = (holdings[s.ticker] || 0) + s.qty
    }

    let invested = 0
    for (const [ticker, qty] of Object.entries(holdings)) {
      const price = priceMap.get(ticker)?.get(date) ?? lastPrice[ticker]
      if (price == null) continue
      lastPrice[ticker] = price

      const currency = currencyByTicker.get(ticker) ?? 'EUR'
      let fx = 1
      if (currency !== 'EUR') {
        fx =
          fxMap.get(currency)?.get(date) ??
          lastFx[currency] ??
          rates[currency] ??
          1
        lastFx[currency] = fx
      }
      invested += (qty * price) / fx
    }

    series.push({
      date,
      total: Math.round((invested + money) * 100) / 100,
      money: Math.round(money * 100) / 100,
    })
  }

  return series
}

export function periodStart(period: Period, now = new Date()): string {
  switch (period) {
    case 'YTD':
      return `${now.getFullYear()}-01-01`
    case '1Y': {
      const d = new Date(now)
      d.setFullYear(d.getFullYear() - 1)
      return d.toISOString().split('T')[0]
    }
    case '5Y': {
      const d = new Date(now)
      d.setFullYear(d.getFullYear() - 5)
      return d.toISOString().split('T')[0]
    }
    default:
      return '1900-01-01'
  }
}

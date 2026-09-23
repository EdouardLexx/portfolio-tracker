import { useMemo, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { HistoricalPrice, Transaction, SymbolInfo } from '../types'
import { SAVINGS_KINDS } from '../types'
import { formatEUR, formatCompactEUR } from '../utils/formatters'
import { useIsDark, chartTheme } from '../hooks/useTheme'

interface WealthChartProps {
  /** Same curve serves the whole estate and the investments alone. */
  title?: string
  transactions: Transaction[]
  history: Record<string, HistoricalPrice[]>
  fxHistory: Record<string, HistoricalPrice[]>
  rates: Record<string, number>
  symbols: Record<string, SymbolInfo>
}

type Period = 'YTD' | '1Y' | '5Y' | 'ALL'

export function WealthChart({
  title = 'Évolution du patrimoine',
  transactions,
  history,
  fxHistory,
  rates,
  symbols,
}: WealthChartProps) {
  const theme = chartTheme(useIsDark())
  const [period, setPeriod] = useState<Period>('ALL')

  const data = useMemo(() => {
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

    const series: { date: string; total: number; money: number }[] = []

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

    const now = new Date()
    let start: string
    switch (period) {
      case 'YTD':
        start = `${now.getFullYear()}-01-01`
        break
      case '1Y': {
        const d = new Date(now)
        d.setFullYear(d.getFullYear() - 1)
        start = d.toISOString().split('T')[0]
        break
      }
      case '5Y': {
        const d = new Date(now)
        d.setFullYear(d.getFullYear() - 5)
        start = d.toISOString().split('T')[0]
        break
      }
      default:
        start = '1900-01-01'
    }

    return series.filter((p) => p.date >= start)
  }, [transactions, history, fxHistory, rates, symbols, period])

  if (!data.length) return null

  const first = data[0]
  const last = data[data.length - 1]
  const change = last.total - first.total

  const periods: Period[] = ['YTD', '1Y', '5Y', 'ALL']

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="flex gap-1">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                period === p
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {p === 'ALL' ? 'Tout' : p === '1Y' ? '1 an' : p === '5Y' ? '5 ans' : p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {formatEUR(last.total)}
        </span>
        <span
          className={`text-sm font-medium ${
            change >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-500 dark:text-red-400'
          }`}
        >
          {change >= 0 ? '+' : ''}
          {formatEUR(change)} sur la période
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          versements compris — ce n'est pas une performance
        </span>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="wealthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: theme.tick }}
            tickFormatter={(v) =>
              new Date(v).toLocaleDateString('fr-FR', {
                month: 'short',
                year: '2-digit',
              })
            }
            minTickGap={60}
          />
          <YAxis
            tick={{ fontSize: 12, fill: theme.tick }}
            tickFormatter={(v) => formatCompactEUR(v)}
            width={80}
          />
          <Tooltip
            labelFormatter={(v) =>
              new Date(v).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })
            }
            formatter={(value: number) => [formatEUR(value), 'Patrimoine']}
            contentStyle={theme.tooltip}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#wealthFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

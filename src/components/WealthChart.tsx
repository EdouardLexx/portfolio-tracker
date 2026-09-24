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
import { formatEUR, formatCompactEUR } from '../utils/formatters'
import { useIsDark, chartTheme } from '../hooks/useTheme'
import { buildWealthSeries, periodStart, type Period } from '../utils/wealthSeries'

interface WealthChartProps {
  /** Same curve serves the whole estate and the investments alone. */
  title?: string
  transactions: Transaction[]
  history: Record<string, HistoricalPrice[]>
  fxHistory: Record<string, HistoricalPrice[]>
  rates: Record<string, number>
  symbols: Record<string, SymbolInfo>
}

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

  const series = useMemo(
    () => buildWealthSeries(transactions, history, fxHistory, rates, symbols),
    [transactions, history, fxHistory, rates, symbols]
  )
  const data = useMemo(() => {
    const start = periodStart(period)
    return series.filter((p) => p.date >= start)
  }, [series, period])

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

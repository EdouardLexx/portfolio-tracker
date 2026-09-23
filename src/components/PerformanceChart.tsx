import { useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts'
import { useIsDark, chartTheme } from '../hooks/useTheme'
import { computePerformance } from '../utils/performance'
import type {
  HistoricalPrice,
  Transaction,
  SymbolInfo,
} from '../types'

interface PerformanceChartProps {
  history: Record<string, HistoricalPrice[]>
  spHistory: HistoricalPrice[]
  ndxHistory: HistoricalPrice[]
  fxHistory: Record<string, HistoricalPrice[]>
  rates: Record<string, number>
  symbols: Record<string, SymbolInfo>
  transactions: Transaction[]
}

type Period = 'YTD' | '1Y' | '5Y' | 'ALL'

const SERIES_LABELS: Record<string, string> = {
  portfolio: 'Portefeuille',
  sp500: 'S&P 500',
  nasdaq100: 'Nasdaq 100',
}

export function PerformanceChart({
  history,
  spHistory,
  ndxHistory,
  fxHistory,
  rates,
  symbols,
  transactions,
}: PerformanceChartProps) {
  const [period, setPeriod] = useState<Period>('ALL')
  const theme = chartTheme(useIsDark())

  const chartData = useMemo(() => {
    const now = new Date()
    let startDate: string
    switch (period) {
      case 'YTD':
        startDate = `${now.getFullYear()}-01-01`
        break
      case '1Y': {
        const d = new Date(now)
        d.setFullYear(d.getFullYear() - 1)
        startDate = d.toISOString().split('T')[0]
        break
      }
      case '5Y': {
        const d = new Date(now)
        d.setFullYear(d.getFullYear() - 5)
        startDate = d.toISOString().split('T')[0]
        break
      }
      default:
        startDate = '1900-01-01'
    }

    return computePerformance({
      transactions,
      history,
      fxHistory,
      spHistory,
      ndxHistory,
      rates,
      symbols,
      startDate,
    }).series
  }, [history, spHistory, ndxHistory, fxHistory, rates, symbols, transactions, period])

  const periods: Period[] = ['YTD', '1Y', '5Y', 'ALL']

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Performance</h3>
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

      {chartData.length > 0 &&
        (() => {
          const last = chartData[chartData.length - 1]
          const chip = (label: string, v: number | null, color: string) =>
            v == null ? null : (
              <span key={label} className={`font-medium ${color}`}>
                {label} {v >= 0 ? '+' : ''}
                {v.toFixed(2)}%
              </span>
            )
          return (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-sm">
              {chip('Portefeuille (TWR)', last.portfolio, 'text-blue-600')}
              {chip('S&P 500', last.sp500, 'text-amber-600')}
              {chip('Nasdaq 100', last.nasdaq100, 'text-violet-600')}
            </div>
          )
        })()}

      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: theme.tick }}
            tickFormatter={(v) =>
              new Date(v).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
                year: '2-digit',
              })
            }
            minTickGap={60}
          />
          <YAxis tick={{ fontSize: 12, fill: theme.tick }} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            labelFormatter={(v) =>
              new Date(v).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })
            }
            formatter={(value: number, name: string) => [
              `${value.toFixed(2)} %`,
              SERIES_LABELS[name] ?? name,
            ]}
            contentStyle={theme.tooltip}
          />
          <Legend formatter={(value) => SERIES_LABELS[value] ?? value} />
          <Line
            type="monotone"
            dataKey="portfolio"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="sp500"
            stroke="#eab308"
            strokeWidth={2}
            dot={false}
            strokeDasharray="4 4"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="nasdaq100"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
            strokeDasharray="2 3"
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

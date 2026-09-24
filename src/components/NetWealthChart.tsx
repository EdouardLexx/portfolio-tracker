import { useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { HistoricalPrice, Loan, SymbolInfo, Transaction } from '../types'
import { formatCompactEUR, formatEUR } from '../utils/formatters'
import { buildWealthSeries, periodStart, type Period } from '../utils/wealthSeries'
import { buildLoanSchedule, totalDebtOn } from '../utils/loans'
import { useIsDark, chartTheme } from '../hooks/useTheme'
import { PeriodButtons } from './WealthChart'

interface NetWealthChartProps {
  transactions: Transaction[]
  history: Record<string, HistoricalPrice[]>
  fxHistory: Record<string, HistoricalPrice[]>
  rates: Record<string, number>
  symbols: Record<string, SymbolInfo>
  loans: Loan[]
}

const GROSS = '#3b82f6'
const NET = '#8b5cf6'

/**
 * Gross wealth against wealth net of what is still owed. The gap is the
 * outstanding capital, so the two lines meet again as the loans are repaid.
 */
export function NetWealthChart({
  transactions,
  history,
  fxHistory,
  rates,
  symbols,
  loans,
}: NetWealthChartProps) {
  const theme = chartTheme(useIsDark())
  const [period, setPeriod] = useState<Period>('ALL')

  const series = useMemo(
    () => buildWealthSeries(transactions, history, fxHistory, rates, symbols),
    [transactions, history, fxHistory, rates, symbols]
  )
  const schedules = useMemo(
    () => loans.map((loan) => ({ loan, schedule: buildLoanSchedule(loan) })),
    [loans]
  )

  const data = useMemo(() => {
    const start = periodStart(period)
    return series
      .filter((p) => p.date >= start)
      .map((p) => {
        const debt = totalDebtOn(schedules, p.date)
        return {
          date: p.date,
          gross: p.total,
          net: Math.round((p.total - debt) * 100) / 100,
          debt,
        }
      })
  }, [series, schedules, period])

  if (!data.length) return null
  const last = data[data.length - 1]

  const legend = (color: string, label: string, dashed = false) => (
    <span className="flex items-center gap-1.5">
      <span
        className="w-4 border-t-2"
        style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }}
      />
      {label}
    </span>
  )

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold">Patrimoine brut et net</h3>
        <PeriodButtons period={period} onChange={setPeriod} />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {formatEUR(last.net)}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          net, soit {formatEUR(last.gross)} brut moins {formatEUR(last.debt)} encore dus
        </span>
      </div>

      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 mb-2">
        {legend(GROSS, 'Brut : tout ce que tu possèdes', true)}
        {legend(NET, 'Net : brut moins le capital restant dû')}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: theme.tick }}
            tickFormatter={(v) =>
              new Date(v).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
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
            formatter={(value: number, name: string) => [
              formatEUR(value),
              name === 'gross' ? 'Brut' : 'Net',
            ]}
            contentStyle={theme.tooltip}
          />
          <Line
            type="monotone"
            dataKey="gross"
            stroke={GROSS}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="net"
            stroke={NET}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

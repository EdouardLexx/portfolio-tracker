import { useMemo, useState } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import type { Transaction } from '../types'
import { wealthStats, project } from '../utils/projection'
import { formatEUR, formatNumber, formatCompactEUR } from '../utils/formatters'
import { useIsDark, chartTheme } from '../hooks/useTheme'

interface WealthProjectionProps {
  transactions: Transaction[]
  currentValue: number
}

const SERIES_LABELS: Record<string, string> = {
  central: 'Projection',
  bandLow: 'Fourchette',
  contributed: 'Apports seuls',
}

export function WealthProjection({
  transactions,
  currentValue,
}: WealthProjectionProps) {
  const theme = chartTheme(useIsDark())
  const stats = useMemo(
    () => wealthStats(transactions, currentValue),
    [transactions, currentValue]
  )

  const [rateOverride, setRateOverride] = useState<number | null>(null)

  const rate = rateOverride ?? stats?.annualReturn ?? 0
  const data = useMemo(() => {
    if (!stats) return []
    return project(stats.currentValue, stats.contributedPerYear, rate).map(
      (p) => ({
        ...p,
        // Recharts stacks an area from a [low, high] pair, which draws the
        // uncertainty band without a second filled series hiding the line.
        band: [p.low, p.high] as [number, number],
      })
    )
  }, [stats, rate])

  if (!stats || !data.length) return null

  const last = data[data.length - 1]
  const inTen = last.central
  const fromReturns = inTen - last.contributed

  const tooShort = stats.years < 1
  const presets = [0.02, 0.04, 0.06, 0.08]

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold">Rythme et projection</h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {formatNumber(stats.years, 1)} an
          {stats.years >= 2 ? 's' : ''} d'historique
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Patrimoine gagné par an
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatEUR(stats.growthPerYear)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            apports et gains confondus
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Dont apports
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatEUR(stats.contributedPerYear)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            ce que tu mets de ta poche, par an
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Rendement annualisé (TRI)
          </p>
          <p
            className={`text-xl font-bold ${
              (stats.annualReturn ?? 0) >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-500 dark:text-red-400'
            }`}
          >
            {stats.annualReturn == null
              ? '—'
              : `${formatNumber(stats.annualReturn * 100)} %`}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            pondéré par la date de chaque versement
          </p>
        </div>
      </div>

      {tooShort && (
        <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 rounded-lg px-4 py-3 mb-4">
          Moins d'un an d'historique : ces moyennes reposent sur trop peu de
          recul pour projeter quoi que ce soit de sérieux.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Rendement retenu :
        </span>
        <button
          onClick={() => setRateOverride(null)}
          className={`px-3 py-1 text-sm rounded-lg transition-colors ${
            rateOverride === null
              ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          Le tien ({formatNumber((stats.annualReturn ?? 0) * 100, 1)} %)
        </button>
        {presets.map((r) => (
          <button
            key={r}
            onClick={() => setRateOverride(r)}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              rateOverride === r
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {formatNumber(r * 100, 0)} %
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data}>
          <defs>
            <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: theme.tick }} />
          <YAxis
            tick={{ fontSize: 12, fill: theme.tick }}
            tickFormatter={(v) => formatCompactEUR(v)}
            width={80}
          />
          <Tooltip
            formatter={(value: number | [number, number], name: string) => {
              if (Array.isArray(value)) {
                return [
                  `${formatEUR(value[0])} – ${formatEUR(value[1])}`,
                  'Fourchette (±2 pts)',
                ]
              }
              return [formatEUR(value), SERIES_LABELS[name] ?? name]
            }}
            contentStyle={theme.tooltip}
          />
          <Legend
            formatter={(value) =>
              value === 'band' ? 'Fourchette (±2 pts)' : (SERIES_LABELS[value] ?? value)
            }
          />
          <Area
            dataKey="band"
            stroke="none"
            fill="url(#projFill)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="contributed"
            stroke={theme.muted}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="central"
            stroke="#8b5cf6"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-violet-50 dark:bg-violet-950 rounded-lg p-4">
          <p className="text-xs text-violet-700 dark:text-violet-300 mb-1">
            Dans 10 ans ({last.label})
          </p>
          <p className="text-2xl font-bold text-violet-900 dark:text-violet-200">
            {formatEUR(inTen)}
          </p>
          <p className="text-xs text-violet-700 dark:text-violet-300 mt-1">
            entre {formatEUR(last.low)} et {formatEUR(last.high)} selon le
            rendement
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Dont produit par les marchés
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatEUR(fromReturns)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            le reste vient de tes versements
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
        Projection, pas prévision : elle prolonge ton rythme d'épargne et ton
        rendement passés, en supposant qu'ils se répètent à l'identique. Les
        marchés ne font pas de moyennes régulières, et rien ici ne tient compte
        de l'inflation ni de la fiscalité.
      </p>
    </div>
  )
}

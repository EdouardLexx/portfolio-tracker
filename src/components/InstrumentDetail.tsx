import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import type { ChartRange } from '../types'
import { useInstrument } from '../hooks/useInstrument'
import { useIsDark, chartTheme } from '../hooks/useTheme'
import {
  CHART_RANGES,
  axisFormatter,
  niceTicks,
  prepareChart,
  rangeChange,
  stepDecimals,
  timeTicks,
  tooltipFormatter,
} from '../utils/instrumentChart'
import { formatCompactNumber, formatMoney, formatNumber } from '../utils/formatters'

interface InstrumentDetailProps {
  symbol: string
  /** Shown until Yahoo's own name arrives. */
  name: string
  onClose: () => void
}

const UP = '#10b981'
const DOWN = '#ef4444'
const AFTER_HOURS = '#9ca3af'

function signed(value: number, text: string): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${text}`
}

/**
 * Google Finance-style view of one listed instrument: price and change, a
 * chart over eight ranges (intraday with after-hours for "1 j") and the day's
 * key figures. Prices are public market data, so discreet mode leaves them.
 */
export function InstrumentDetail({ symbol, name, onClose }: InstrumentDetailProps) {
  const theme = chartTheme(useIsDark())
  const [range, setRange] = useState<ChartRange>('1d')
  const { info, infoError, chart, chartError, chartLoading } = useInstrument(symbol, range)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const crypto = chart?.instrumentType === 'CRYPTOCURRENCY' || info?.quoteType === 'CRYPTOCURRENCY'
  const timeZone = chart?.timezone ?? info?.timezone ?? 'UTC'
  const currency = info?.currency ?? 'EUR'
  const data = useMemo(() => (chart ? prepareChart(chart, range) : []), [chart, range])
  const move = info ? rangeChange(data, range, info, crypto) : null
  const up = (move?.change ?? 0) >= 0
  const color = up ? UP : DOWN
  const period = CHART_RANGES.find((r) => r.range === range)?.period ?? ''
  const showBase = range === '1d' && !crypto && move != null

  const yTicks = useMemo(() => {
    const values = data.map((p) => p.close)
    if (showBase && move) values.push(move.base)
    if (!values.length) return [0, 1]
    return niceTicks(Math.min(...values), Math.max(...values))
  }, [data, showBase, move])
  const xTicks = useMemo(() => timeTicks(data, range, timeZone), [data, range, timeZone])
  const yMin = yTicks[0]
  const yMax = yTicks[yTicks.length - 1]

  const money = (v: number | null) => (v == null ? '—' : formatMoney(v, currency))
  const decimals = yTicks.length > 1 ? stepDecimals(yTicks[1] - yTicks[0]) : 2

  const closedAt =
    info?.time &&
    new Intl.DateTimeFormat('fr-FR', {
      timeZone,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(info.time))
  const open = info?.marketState === 'REGULAR'
  const afterHours =
    info && !open && !crypto && info.postMarketPrice != null && info.postMarketChange != null

  const stats: [string, string][] = info
    ? [
        ['Ouverture', money(info.open)],
        ['Plus haut', money(info.dayHigh)],
        ['Plus bas', money(info.dayLow)],
        ['Capitalisation', info.marketCap ? formatCompactNumber(info.marketCap) : '—'],
        ['PER', info.trailingPE ? formatNumber(info.trailingPE) : '—'],
        ['Rendement du dividende', info.dividendYield ? `${formatNumber(info.dividendYield)} %` : '—'],
        ['Max. 52 sem.', money(info.fiftyTwoWeekHigh)],
        ['Min. 52 sem.', money(info.fiftyTwoWeekLow)],
        ['Volume', info.volume ? formatCompactNumber(info.volume) : '—'],
      ]
    : []

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={info?.name ?? name}
      className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/50 dark:bg-black/70 md:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-4xl min-h-full md:min-h-0 max-h-full overflow-y-auto bg-white dark:bg-gray-900 md:rounded-xl border border-gray-100 dark:border-gray-800 shadow-xl p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {info?.name ?? name}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {info?.exchange ? `${info.exchange} : ` : ''}
              {symbol}
            </p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 w-9 h-9 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            ✕
          </button>
        </div>

        {infoError ? (
          <p className="text-sm rounded-lg px-4 py-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">
            {infoError}
          </p>
        ) : !info ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-10 text-center">Chargement…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-4xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                {move ? formatMoney(move.price, currency) : money(info.price)}
              </span>
              {move && (
                <>
                  <span
                    className={`px-2 py-1 rounded-md text-sm font-medium tabular-nums ${
                      up
                        ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
                    }`}
                  >
                    {up ? '↑' : '↓'} {formatNumber(Math.abs(move.percent))} %
                  </span>
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                    }`}
                  >
                    {signed(move.change, formatNumber(Math.abs(move.change)))} {period}
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {open || crypto ? 'En séance' : `Clôture : ${closedAt ?? '—'}`}
              {' · '}cours Yahoo Finance, en {currency}
            </p>
            {afterHours && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Après la clôture : {formatMoney(info.postMarketPrice!, currency)}{' '}
                {signed(info.postMarketChange!, formatNumber(Math.abs(info.postMarketChange!)))} (
                {signed(
                  info.postMarketChangePercent ?? 0,
                  formatNumber(Math.abs(info.postMarketChangePercent ?? 0))
                )}{' '}
                %)
              </p>
            )}
          </>
        )}

        <div className="flex gap-1 mt-5 mb-3 border-b border-gray-100 dark:border-gray-800 overflow-x-auto">
          {CHART_RANGES.map((r) => (
            <button
              key={r.range}
              onClick={() => setRange(r.range)}
              className={`shrink-0 px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${
                range === r.range
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 font-medium'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className={`transition-opacity ${chartLoading ? 'opacity-40' : ''}`}>
          {chartError ? (
            <p className="h-[300px] flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              Graphique indisponible pour cette période.
            </p>
          ) : !data.length ? (
            <p className="h-[300px] flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              {chartLoading ? 'Chargement…' : 'Aucune cotation sur cette période.'}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`instrument-${up ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 12, fill: theme.tick }}
                  tickFormatter={axisFormatter(range, timeZone)}
                  ticks={xTicks}
                  interval={xTicks ? 0 : 'preserveEnd'}
                  minTickGap={xTicks ? 0 : 50}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  ticks={yTicks}
                  tick={{ fontSize: 12, fill: theme.tick }}
                  tickFormatter={(v: number) => formatNumber(v, decimals)}
                  width={70}
                  allowDataOverflow
                />
                <Tooltip
                  labelFormatter={(t) => tooltipFormatter(range, timeZone)(Number(t))}
                  formatter={(v: number, key: string) => [
                    formatMoney(v, currency),
                    key === 'extended' ? 'Après clôture' : 'Cours',
                  ]}
                  contentStyle={theme.tooltip}
                />
                {showBase && move && (
                  <ReferenceLine
                    y={move.base}
                    stroke={theme.muted}
                    strokeDasharray="2 4"
                    label={{
                      value: `Clôture préc. ${formatNumber(move.base)}`,
                      position: 'insideTopRight',
                      fill: theme.muted,
                      fontSize: 11,
                    }}
                  />
                )}
                <Area
                  type="linear"
                  dataKey="regular"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#instrument-${up ? 'up' : 'down'})`}
                  dot={false}
                  isAnimationActive={false}
                />
                <Area
                  type="linear"
                  dataKey="extended"
                  stroke={AFTER_HOURS}
                  strokeWidth={1.5}
                  fill="none"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {stats.length > 0 && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 mt-6 text-sm">
            {stats.map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-4 border-b border-gray-100 dark:border-gray-800 py-1.5"
              >
                <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100 tabular-nums text-right">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}

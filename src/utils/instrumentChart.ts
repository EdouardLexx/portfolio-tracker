import type { ChartRange, InstrumentChart, InstrumentInfo } from '../types'
import { CASH_SYMBOL, COIN_SPECS, SAVINGS_SYMBOL } from '../types'

// Gold coins, the Livret A and cash are priced by the app itself: Yahoo has
// no chart for them.
const SYNTHETIC = new Set([SAVINGS_SYMBOL, CASH_SYMBOL, ...COIN_SPECS.map((c) => c.id)])

export function hasMarketChart(ticker: string | undefined): ticker is string {
  return !!ticker && !SYNTHETIC.has(ticker)
}

export const CHART_RANGES: { range: ChartRange; label: string; period: string }[] = [
  { range: '1d', label: '1 j', period: "aujourd'hui" },
  { range: '5d', label: '5 j', period: 'sur 5 jours' },
  { range: '1mo', label: '1 m', period: 'sur 1 mois' },
  { range: '6mo', label: '6 m', period: 'sur 6 mois' },
  { range: 'ytd', label: 'YTD', period: 'depuis le 1er janvier' },
  { range: '1y', label: '1 a', period: 'sur 1 an' },
  { range: '5y', label: '5 a', period: 'sur 5 ans' },
  { range: 'max', label: 'Max', period: 'depuis la cotation' },
]

export interface ChartPoint {
  t: number
  close: number
  /** Price during the regular session, null outside it. */
  regular: number | null
  /** Price after the close, drawn in grey; null during the session. */
  extended: number | null
}

const DAY_MS = 86_400_000

/** Minutes since midnight, and the calendar day, on the exchange's clock. */
function exchangeClock(t: number, offsetSeconds: number) {
  const local = new Date(t + offsetSeconds * 1000)
  return {
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    day: local.toISOString().slice(0, 10),
  }
}

const regularOnly = (points: InstrumentChart['points']): ChartPoint[] =>
  points.map((p) => ({ t: p.t, close: p.close, regular: p.close, extended: null }))

/**
 * Points to draw for a range. "1 j" and "5 j" keep the last one or five
 * sessions: Yahoo returns a few extra days so a weekend or a holiday never
 * leaves the chart empty. Pre-market is dropped and after-hours kept apart, as
 * Google Finance shows them. A crypto trades around the clock, so its sessions
 * are rolling 24-hour windows instead.
 */
export function prepareChart(chart: InstrumentChart, range: ChartRange): ChartPoint[] {
  const points = chart.points
  if (!points.length) return []
  if (range !== '1d' && range !== '5d') return regularOnly(points)

  const days = range === '1d' ? 1 : 5
  if (chart.instrumentType === 'CRYPTOCURRENCY') {
    const end = points[points.length - 1].t
    return regularOnly(points.filter((p) => p.t > end - days * DAY_MS))
  }

  // Only the time of day of the published session matters: it is the same
  // every day, whichever session Yahoo announces next.
  const offset = chart.gmtoffset
  const minutesOf = (iso: string | null, fallback: number) =>
    iso ? exchangeClock(Date.parse(iso), offset).minutes : fallback
  const open = minutesOf(chart.regularStart, 0)
  const close = minutesOf(chart.regularEnd, 24 * 60)

  const clocked = points.map((p) => ({ ...p, ...exchangeClock(p.t, offset) }))
  const sessions = [
    ...new Set(
      clocked.filter((p) => p.minutes >= open && p.minutes < close).map((p) => p.day)
    ),
  ].sort()
  const kept = new Set(sessions.slice(-days))

  // Only "1 j" is fetched with after-hours: elsewhere a point past the close
  // is Yahoo's closing print, stamped a few minutes after the bell.
  const splitAfterHours = range === '1d'
  const data: ChartPoint[] = clocked
    .filter((p) => kept.has(p.day) && p.minutes >= open)
    .map((p) => {
      const inSession = !splitAfterHours || p.minutes < close
      return {
        t: p.t,
        close: p.close,
        regular: inSession ? p.close : null,
        extended: inSession ? null : p.close,
      }
    })

  // Join the grey after-hours line to the last point of the session.
  const firstAfter = data.findIndex((p) => p.extended != null)
  if (firstAfter > 0 && data[firstAfter - 1].regular != null) {
    data[firstAfter - 1] = { ...data[firstAfter - 1], extended: data[firstAfter - 1].close }
  }
  return data
}

/**
 * Change shown next to the price. For the day of a listed security it is the
 * official one, against the previous close; otherwise the range's last price
 * against its first.
 */
export function rangeChange(
  data: ChartPoint[],
  range: ChartRange,
  info: InstrumentInfo,
  crypto: boolean
): { price: number; change: number; percent: number; base: number } | null {
  if (!data.length) return null
  if (
    range === '1d' &&
    !crypto &&
    info.price != null &&
    info.change != null &&
    info.changePercent != null &&
    info.previousClose != null
  ) {
    return {
      price: info.price,
      change: info.change,
      percent: info.changePercent,
      base: info.previousClose,
    }
  }
  const session = data.filter((p) => p.regular != null)
  const first = session[0] ?? data[0]
  const last = session[session.length - 1] ?? data[data.length - 1]
  const change = last.close - first.close
  return {
    price: last.close,
    change,
    percent: first.close ? (change / first.close) * 100 : 0,
    base: first.close,
  }
}

/** Decimals a tick step needs: 0 for 2, 1 for 0,2, 2 for 0,05. */
export function stepDecimals(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
}

/**
 * Round ticks spanning `min`–`max` (146, 148, 150… rather than 147,47 and
 * 156,28): steps of 1, 2 or 5 times a power of ten, so every tick prints
 * exactly with the step's decimals.
 */
export function niceTicks(min: number, max: number, target = 6): number[] {
  if (!(max > min)) return [min]
  const rough = (max - min) / (target - 1)
  const power = Math.pow(10, Math.floor(Math.log10(rough)))
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power
  const decimals = stepDecimals(step)
  const at = (k: number) => Number((k * step).toFixed(decimals))
  const ticks: number[] = []
  for (let k = Math.floor(min / step); ticks.length <= 20; k++) {
    ticks.push(at(k))
    if (at(k) >= max) break
  }
  return ticks
}

/**
 * Where the time axis gets labels. Left to the chart, "5 j" would print the
 * same day several times and "1 j" odd times like 11:25: one tick per session
 * and whole hours read better. Other ranges keep the chart's own spacing.
 */
export function timeTicks(
  data: ChartPoint[],
  range: ChartRange,
  timeZone: string
): number[] | undefined {
  if (range !== '1d' && range !== '5d') return undefined
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const clock = (t: number) => {
    const p = Object.fromEntries(parts.formatToParts(t).map((x) => [x.type, x.value]))
    return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) }
  }

  if (range === '5d') {
    const seen = new Set<string>()
    return data
      .filter((p) => {
        const day = clock(p.t).day
        if (seen.has(day)) return false
        seen.add(day)
        return true
      })
      .map((p) => p.t)
  }

  const hours = data.filter((p) => clock(p.t).minute === 0).map((p) => p.t)
  // Around the clock (crypto) that is 24 ticks: keep one in every few.
  const every = Math.ceil(hours.length / 8)
  return hours.filter((_, i) => i % every === 0)
}

/** Axis labels on the exchange's clock, as fine as the range calls for. */
export function axisFormatter(range: ChartRange, timeZone: string): (t: number) => string {
  const options: Intl.DateTimeFormatOptions =
    range === '1d'
      ? { hour: '2-digit', minute: '2-digit' }
      : range === '5d'
        ? { weekday: 'short', day: 'numeric' }
        : range === '5y' || range === 'max'
          ? { month: 'short', year: 'numeric' }
          : { day: 'numeric', month: 'short' }
  const format = new Intl.DateTimeFormat('fr-FR', { ...options, timeZone })
  return (t) => format.format(t)
}

export function tooltipFormatter(range: ChartRange, timeZone: string): (t: number) => string {
  const intraday = range === '1d' || range === '5d' || range === '1mo'
  const format = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: intraday ? undefined : 'numeric',
    hour: intraday ? '2-digit' : undefined,
    minute: intraday ? '2-digit' : undefined,
  })
  return (t) => format.format(t)
}

import { useEffect, useState } from 'react'
import type { ChartRange, InstrumentChart, InstrumentInfo } from '../types'
import { fetchChart, fetchInstrument } from '../api/stockApi'

type Loaded<T> = { key: string; value?: T; error?: string }

/**
 * Market data for the detail view of one instrument. It lives outside
 * usePortfolio on purpose: nothing here belongs to the portfolio, and it is
 * dropped when the view closes. State is keyed by request so a slow answer
 * for a range left behind never overwrites the current one.
 */
export function useInstrument(symbol: string, range: ChartRange) {
  const [info, setInfo] = useState<Loaded<InstrumentInfo> | null>(null)
  const [chart, setChart] = useState<Loaded<InstrumentChart> | null>(null)
  const chartKey = `${symbol}:${range}`

  useEffect(() => {
    let live = true
    fetchInstrument(symbol)
      .then((value) => live && setInfo({ key: symbol, value }))
      .catch((e: Error) => live && setInfo({ key: symbol, error: e.message }))
    return () => {
      live = false
    }
  }, [symbol])

  useEffect(() => {
    let live = true
    fetchChart(symbol, range)
      .then((value) => live && setChart({ key: chartKey, value }))
      .catch((e: Error) => live && setChart({ key: chartKey, error: e.message }))
    return () => {
      live = false
    }
  }, [symbol, range, chartKey])

  const current = info?.key === symbol ? info : null
  return {
    info: current?.value ?? null,
    infoError: current?.error ?? null,
    // The previous range stays on screen, dimmed, until the new one arrives.
    chart: chart?.value ?? null,
    chartError: chart?.key === chartKey ? (chart.error ?? null) : null,
    chartLoading: chart?.key !== chartKey,
  }
}

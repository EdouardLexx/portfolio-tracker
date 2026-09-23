import type { Transaction } from '../types'

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25

export interface WealthStats {
  years: number
  firstDate: string
  contributedTotal: number
  contributedPerYear: number
  currentValue: number
  gain: number
  /** Money-weighted annual return (IRR), null when it cannot be solved. */
  annualReturn: number | null
  growthPerYear: number
}

/**
 * Money-weighted return over the real cash-flow history. A simple
 * value/cost ratio would overstate it: money added last month has not had
 * the same time to work as money added two years ago.
 */
export function annualisedReturn(
  flows: { date: string; amount: number }[],
  currentValue: number,
  now = Date.now()
): number | null {
  if (!flows.length || currentValue <= 0) return null

  const terms = flows.map((f) => ({
    amount: f.amount,
    years: (now - new Date(f.date).getTime()) / MS_PER_YEAR,
  }))
  if (terms.every((t) => t.years <= 0)) return null

  // Future value of every contribution at rate r, compared to what is held.
  const fv = (r: number) =>
    terms.reduce((s, t) => s + t.amount * Math.pow(1 + r, t.years), 0)

  let lo = -0.9
  let hi = 3
  if ((fv(lo) - currentValue) * (fv(hi) - currentValue) > 0) return null

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (fv(mid) - currentValue > 0) hi = mid
    else lo = mid
  }
  const r = (lo + hi) / 2
  return Number.isFinite(r) ? r : null
}

export function wealthStats(
  transactions: Transaction[],
  currentValue: number
): WealthStats | null {
  if (!transactions.length) return null

  const flows = transactions
    .map((t) => ({ date: t.date, amount: t.amountEUR }))
    .filter((f) => f.amount !== 0)
  if (!flows.length) return null

  const firstDate = flows.map((f) => f.date).sort()[0]
  const years = (Date.now() - new Date(firstDate).getTime()) / MS_PER_YEAR
  const contributedTotal = flows.reduce((s, f) => s + f.amount, 0)

  return {
    years,
    firstDate,
    contributedTotal,
    contributedPerYear: years > 0 ? contributedTotal / years : 0,
    currentValue,
    gain: currentValue - contributedTotal,
    annualReturn: annualisedReturn(flows, currentValue),
    growthPerYear: years > 0 ? currentValue / years : 0,
  }
}

export interface ProjectionPoint {
  year: number
  label: string
  central: number
  low: number
  high: number
  /** Contributions only, to show what comes from saving vs from returns. */
  contributed: number
}

/**
 * Compounds the current wealth forward while adding the usual yearly
 * contribution. The band is the same model at ±`spread` of return, so the
 * width shows how much the outcome hangs on an assumption nobody controls.
 */
export function project(
  currentValue: number,
  contributionPerYear: number,
  annualReturn: number,
  horizonYears = 10,
  spread = 0.02
): ProjectionPoint[] {
  const startYear = new Date().getFullYear()

  const at = (rate: number, year: number) => {
    const growth = Math.pow(1 + rate, year)
    const contributions =
      Math.abs(rate) < 1e-6
        ? contributionPerYear * year
        : contributionPerYear * ((growth - 1) / rate)
    return currentValue * growth + contributions
  }

  return Array.from({ length: horizonYears + 1 }, (_, year) => ({
    year,
    label: String(startYear + year),
    central: Math.round(at(annualReturn, year)),
    low: Math.round(at(Math.max(annualReturn - spread, -0.5), year)),
    high: Math.round(at(annualReturn + spread, year)),
    contributed: Math.round(currentValue + contributionPerYear * year),
  }))
}

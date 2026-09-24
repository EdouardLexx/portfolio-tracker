/**
 * Discreet mode hides what reveals the size of the portfolio: euro amounts and
 * held quantities. Percentages and unit prices stay, since they say nothing
 * about how much is owned. A module flag rather than a React context because
 * every amount already goes through this file; `useDiscreet` sets it before
 * App re-renders, which repaints every page.
 */
let discreet = false
const MASK = '•••'

export function setDiscreet(on: boolean): void {
  discreet = on
}

export function isDiscreet(): boolean {
  return discreet
}

export function formatEUR(value: number): string {
  if (discreet) return `${MASK} €`
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Share counts are whole numbers; crypto holdings are not. Show just enough
 * decimals to keep a fraction of a coin meaningful.
 */
export function formatQuantity(value: number): string {
  if (discreet) return MASK
  if (Number.isInteger(value)) return String(value)
  const decimals = Math.abs(value) < 1 ? 8 : 4
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(value)
}

/** Formats in any currency the broker reports (USD, JPY, GBp, …). */
export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100)
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/** A plain number that measures a holding (grams owned, sums paid in). */
export function formatHolding(value: number, decimals = 2): string {
  return discreet ? MASK : formatNumber(value, decimals)
}

/** Market figures (capitalisation, volume): 29,24 Md, 4,57 M. Never masked. */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatMarketCap(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)} T$`
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} Md$`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} M$`
  return `${value.toFixed(0)} $`
}

export function formatCompactEUR(value: number): string {
  if (discreet) return `${MASK} €`
  const fr = (n: number, decimals: number) =>
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n)

  if (Math.abs(value) >= 1e6) return `${fr(value / 1e6, 2)} M €`
  if (Math.abs(value) >= 1e3) return `${fr(value / 1e3, 1)} k €`
  return formatEUR(value)
}

/**
 * Black or white, whichever reads better on `hex`. Account colours range from
 * dark blue to bright amber, so a fixed white would fail on the light ones.
 */
export function readableTextOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Contrast against white vs against near-black, whichever is higher.
  return (1.05 / (luminance + 0.05)) > ((luminance + 0.05) / 0.05)
    ? '#ffffff'
    : '#111827'
}

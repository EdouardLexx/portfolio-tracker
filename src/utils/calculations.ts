import type {
  Transaction,
  Position,
  PortfolioSummary,
  StockQuote,
  SymbolInfo,
  AccountKind,
} from '../types'

export type FxRates = Record<string, number>

/** Converts an amount from `currency` into EUR. Rates are units per 1 EUR. */
export function toEur(
  amount: number,
  currency: string,
  rates: FxRates
): number {
  const rate = rates[currency]
  if (!rate || !Number.isFinite(rate)) return currency === 'EUR' ? amount : 0
  return amount / rate
}

export function currenciesUsed(txs: Transaction[]): string[] {
  return [...new Set(txs.map((t) => t.currency))]
}

export function isinsUsed(txs: Transaction[]): string[] {
  return [...new Set(txs.map((t) => t.isin).filter(Boolean))]
}

export function filterByAccount(
  txs: Transaction[],
  account: AccountKind | 'all'
): Transaction[] {
  return account === 'all' ? txs : txs.filter((t) => t.account === account)
}

/**
 * Line a transaction belongs to: symbol first (crypto and manual assets have
 * no ISIN), then ISIN, never the product name while either exists — a fund
 * keeps its line when its issuer renames it.
 */
export function positionKey(tx: Transaction): string {
  return tx.symbol || tx.isin || tx.productName
}

export function buildPositions(
  txs: Transaction[],
  symbols: Record<string, SymbolInfo>,
  quotes: StockQuote[],
  rates: FxRates
): Position[] {
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]))

  interface Bucket {
    isin: string
    directSymbol?: string
    name: string
    accounts: Set<AccountKind>
    quantity: number
    costEUR: number
    grossLocal: number
    currency: string
    brokerFees: number
    fxFees: number
    orderRefs: Set<string>
    firstDate: string
    lastDate: string
  }

  const buckets = new Map<string, Bucket>()

  for (const tx of txs) {
    const key = positionKey(tx)
    let b = buckets.get(key)
    if (!b) {
      b = {
        isin: tx.isin,
        directSymbol: tx.symbol,
        name: tx.productName,
        accounts: new Set(),
        quantity: 0,
        costEUR: 0,
        grossLocal: 0,
        currency: tx.currency,
        brokerFees: 0,
        fxFees: 0,
        orderRefs: new Set(),
        firstDate: tx.date,
        lastDate: tx.date,
      }
      buckets.set(key, b)
    }

    b.accounts.add(tx.account)
    b.quantity += tx.quantity
    b.costEUR += tx.amountEUR
    b.grossLocal += tx.grossLocal
    b.brokerFees += tx.brokerFeesEUR
    b.fxFees += tx.fxFeesEUR
    b.orderRefs.add(tx.orderRef)
    if (tx.date < b.firstDate) b.firstDate = tx.date
    // Keep the most recent product name: issuers rename funds over time.
    if (tx.date >= b.lastDate) {
      b.lastDate = tx.date
      b.name = tx.productName
    }
  }

  const positions: Position[] = []

  for (const [key, b] of buckets) {
    const info = b.directSymbol
      ? { isin: '', symbol: b.directSymbol, currency: 'EUR', name: b.name }
      : symbols[b.isin]
    const quote = info ? quoteBySymbol.get(info.symbol) : undefined
    const currency = quote?.currency || info?.currency || b.currency

    const currentPriceLocal = quote?.price ?? 0
    const currentPriceEUR = toEur(currentPriceLocal, currency, rates)
    const currentValueEUR = b.quantity * currentPriceEUR
    const pnlEUR = currentValueEUR - b.costEUR
    const pnlPercent = b.costEUR > 0 ? (pnlEUR / b.costEUR) * 100 : 0

    const years =
      (Date.now() - new Date(b.firstDate).getTime()) /
      (1000 * 60 * 60 * 24 * 365.25)
    const cagrPercent =
      years >= 1 && b.costEUR > 0 && currentValueEUR > 0
        ? (Math.pow(currentValueEUR / b.costEUR, 1 / years) - 1) * 100
        : null

    const accounts = [...b.accounts]

    positions.push({
      key,
      isin: b.isin,
      ticker: info?.symbol ?? '',
      name: quote?.name || info?.name || b.name,
      account: accounts[0],
      accounts,
      currency,
      quantity: b.quantity,
      totalCostEUR: b.costEUR,
      avgCostEUR: b.costEUR / b.quantity,
      avgCostLocal: b.grossLocal / b.quantity,
      currentPriceLocal,
      currentPriceEUR,
      currentValueEUR,
      pnlEUR,
      pnlPercent,
      weight: 0,
      firstBuyDate: b.firstDate,
      cagrPercent,
      feesEUR: b.brokerFees + b.fxFees,
      brokerFeesEUR: b.brokerFees,
      fxFeesEUR: b.fxFees,
      orderCount: b.orderRefs.size,
      priced: Boolean(quote?.price),
    })
  }

  const total = positions.reduce((s, p) => s + p.currentValueEUR, 0)
  for (const p of positions) {
    p.weight = total > 0 ? (p.currentValueEUR / total) * 100 : 0
  }

  return positions.sort((a, b) => b.currentValueEUR - a.currentValueEUR)
}

export function buildSummary(
  positions: Position[],
  txs: Transaction[]
): PortfolioSummary {
  const totalValueEUR = positions.reduce((s, p) => s + p.currentValueEUR, 0)
  const totalCostEUR = positions.reduce((s, p) => s + p.totalCostEUR, 0)
  const totalPnlEUR = totalValueEUR - totalCostEUR
  const totalPnlPercent =
    totalCostEUR > 0 ? (totalPnlEUR / totalCostEUR) * 100 : 0

  const brokerFeesEUR = txs.reduce((s, t) => s + t.brokerFeesEUR, 0)
  const fxFeesEUR = txs.reduce((s, t) => s + t.fxFeesEUR, 0)
  const totalFeesEUR = brokerFeesEUR + fxFeesEUR

  const dates = txs.map((t) => t.date).sort()
  const firstDate = dates[0] ?? ''
  const years = firstDate
    ? (Date.now() - new Date(firstDate).getTime()) /
      (1000 * 60 * 60 * 24 * 365.25)
    : 0
  const cagrPercent =
    years >= 1 && totalCostEUR > 0 && totalValueEUR > 0
      ? (Math.pow(totalValueEUR / totalCostEUR, 1 / years) - 1) * 100
      : null

  return {
    totalValueEUR,
    totalCostEUR,
    totalFeesEUR,
    brokerFeesEUR,
    fxFeesEUR,
    feesPercentOfInvested:
      totalCostEUR > 0 ? (totalFeesEUR / totalCostEUR) * 100 : 0,
    orderCount: new Set(txs.map((t) => t.orderRef)).size,
    totalPnlEUR,
    totalPnlPercent,
    cagrPercent,
    firstDate,
  }
}

/** Per-account totals for the combined view. */
export function summarisePerAccount(
  txs: Transaction[],
  positions: Position[]
): { account: AccountKind; valueEUR: number; costEUR: number }[] {
  const costByAccount = new Map<AccountKind, number>()
  for (const tx of txs) {
    costByAccount.set(
      tx.account,
      (costByAccount.get(tx.account) ?? 0) + tx.amountEUR
    )
  }

  // A position can span accounts only if the same ISIN is held in both; value
  // is then split pro-rata to what each account contributed.
  const valueByAccount = new Map<AccountKind, number>()
  for (const p of positions) {
    if (p.accounts.length === 1) {
      const a = p.accounts[0]
      valueByAccount.set(a, (valueByAccount.get(a) ?? 0) + p.currentValueEUR)
    } else {
      const costs = p.accounts.map(
        (a) =>
          txs
            .filter((t) => t.account === a && positionKey(t) === p.key)
            .reduce((s, t) => s + t.amountEUR, 0)
      )
      const totalCost = costs.reduce((s, c) => s + c, 0)
      p.accounts.forEach((a, i) => {
        const share = totalCost > 0 ? costs[i] / totalCost : 0
        valueByAccount.set(
          a,
          (valueByAccount.get(a) ?? 0) + p.currentValueEUR * share
        )
      })
    }
  }

  return [...costByAccount.keys()].map((account) => ({
    account,
    valueEUR: valueByAccount.get(account) ?? 0,
    costEUR: costByAccount.get(account) ?? 0,
  }))
}

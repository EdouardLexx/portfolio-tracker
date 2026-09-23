import type { Transaction, StockQuote, HistoricalPrice } from '../types'
import { COIN_SPECS, TROY_OUNCE_GRAMS } from '../types'
import { makeTransactionId } from './shared'

/** Yahoo quotes gold as COMEX futures in USD per troy ounce. */
export const GOLD_SPOT_SYMBOL = 'GC=F'

export function coinSpec(coinId: string) {
  return COIN_SPECS.find((c) => c.id === coinId) ?? COIN_SPECS[0]
}

/** Melt value of one coin, from an ounce price and the EUR rate of that day. */
export function coinValueEUR(
  coinId: string,
  ouncePriceUSD: number,
  eurUsdRate: number
): number {
  if (!ouncePriceUSD || !eurUsdRate) return 0
  const spec = coinSpec(coinId)
  const perGramUSD = ouncePriceUSD / TROY_OUNCE_GRAMS
  return (perGramUSD * spec.fineGoldGrams) / eurUsdRate
}

export interface GoldEntry {
  coinId: string
  date: string
  quantity: number
  /** Total actually paid. Left empty, the melt value of the day is used. */
  totalPaidEUR?: number
}

export function buildGoldTransaction(
  entry: GoldEntry,
  meltValuePerCoinEUR: number
): Transaction {
  const spec = coinSpec(entry.coinId)
  const unitPrice =
    entry.totalPaidEUR && entry.quantity > 0
      ? entry.totalPaidEUR / entry.quantity
      : meltValuePerCoinEUR
  const amountEUR = unitPrice * entry.quantity

  return {
    id: makeTransactionId({
      account: 'gold',
      orderRef: `${entry.coinId}-${entry.date}`,
      date: entry.date,
      time: '00:00:00',
      isin: entry.coinId,
      quantity: entry.quantity,
      price: unitPrice,
      amountEUR,
    }),
    account: 'gold',
    date: entry.date,
    time: '00:00:00',
    isin: '',
    symbol: entry.coinId,
    productName: spec.label,
    quantity: entry.quantity,
    price: unitPrice,
    currency: 'EUR',
    grossLocal: amountEUR,
    amountEUR,
    brokerFeesEUR: 0,
    fxFeesEUR: 0,
    feesEUR: 0,
    orderRef: `${entry.coinId}-${entry.date}-${entry.quantity}`,
    source: 'Saisie manuelle',
  }
}

/**
 * Coins have no ticker of their own, so their quote is synthesised from the
 * gold spot price. buildPositions then values them like any other line.
 */
export function goldQuotes(
  coinIds: string[],
  ouncePriceUSD: number,
  eurUsdRate: number
): StockQuote[] {
  return coinIds.map((coinId) => {
    const spec = coinSpec(coinId)
    return {
      symbol: coinId,
      price: coinValueEUR(coinId, ouncePriceUSD, eurUsdRate),
      currency: 'EUR',
      change: 0,
      changePercent: 0,
      marketCap: 0,
      name: spec.label,
    }
  })
}

/** Same conversion applied to the spot history, for the performance chart. */
export function goldHistory(
  coinId: string,
  spotHistory: HistoricalPrice[],
  fxHistory: HistoricalPrice[],
  fallbackRate: number
): HistoricalPrice[] {
  const rateByDate = new Map(fxHistory.map((d) => [d.date, d.close]))
  let lastRate = fallbackRate

  return spotHistory.map((d) => {
    lastRate = rateByDate.get(d.date) ?? lastRate
    const value = coinValueEUR(coinId, d.close, lastRate)
    return { date: d.date, close: value, adjClose: value }
  })
}

import type { Transaction, StockQuote } from '../types'
import { SAVINGS_SYMBOL, CASH_SYMBOL } from '../types'
import { makeTransactionId } from './shared'
import { toLocalISODate } from '../utils/dates'

export interface SavingsBalance {
  balanceEUR: number
  updatedAt: string
}

export const OPENING_SOURCE = 'Solde de départ'

/**
 * `opening` records the balance the account held when tracking began: it is
 * counted as paid in, and interest is measured from there. Its own reference
 * keeps it apart from a deposit of the same amount on the same day.
 */
export function buildSavingsDeposit(
  date: string,
  amountEUR: number,
  kind: 'deposit' | 'opening' = 'deposit'
): Transaction {
  const ref = kind === 'opening' ? `${SAVINGS_SYMBOL}-OPENING` : SAVINGS_SYMBOL
  return {
    id: makeTransactionId({
      account: 'savings',
      orderRef: `${ref}-${date}`,
      date,
      time: '00:00:00',
      isin: SAVINGS_SYMBOL,
      quantity: amountEUR,
      price: 1,
      amountEUR,
    }),
    account: 'savings',
    date,
    time: '00:00:00',
    isin: '',
    symbol: SAVINGS_SYMBOL,
    productName: 'Livret A',
    // One unit: the position is valued from the declared balance, not from a
    // quantity times a price.
    quantity: 1,
    price: amountEUR,
    currency: 'EUR',
    grossLocal: amountEUR,
    amountEUR,
    brokerFeesEUR: 0,
    fxFeesEUR: 0,
    feesEUR: 0,
    orderRef: `${ref}-${date}-${amountEUR}`,
    source: kind === 'opening' ? OPENING_SOURCE : 'Saisie manuelle',
  }
}

export function isOpeningBalance(tx: Transaction): boolean {
  return tx.account === 'savings' && tx.source === OPENING_SOURCE
}

/**
 * A balance typed before any movement used to count only on its own page:
 * without a movement there is no position, so neither Patrimoine nor Données
 * saw it. It becomes the opening movement it stands for, dated the day it was
 * typed. Returns null when there is nothing to migrate.
 */
export function migrateOrphanBalance(
  transactions: Transaction[],
  balance: SavingsBalance | null
): Transaction[] | null {
  if (!balance || !(balance.balanceEUR > 0)) return null
  if (transactions.some((t) => t.account === 'savings')) return null
  const date = toLocalISODate(new Date(balance.updatedAt))
  return [...transactions, buildSavingsDeposit(date, balance.balanceEUR, 'opening')]
}

/**
 * Livret A balance. Interest lines come from a statement, so they beat a
 * hand-typed balance; with neither, the balance is what was paid in.
 */
export function savingsBalance(
  transactions: Transaction[],
  typed: SavingsBalance | null
): { paidInEUR: number; interestEUR: number; balanceEUR: number } {
  const rows = transactions.filter((t) => t.account === 'savings')
  const paidInEUR = rows.reduce((s, t) => s + t.amountEUR, 0)
  const booked = rows.reduce((s, t) => s + (t.interestEUR ?? 0), 0)
  const balanceEUR = booked ? paidInEUR + booked : (typed?.balanceEUR ?? paidInEUR)
  return { paidInEUR, interestEUR: balanceEUR - paidInEUR, balanceEUR }
}

/**
 * The declared balance divided across the deposits, so the position's single
 * unit carries the whole balance whatever the number of movements.
 */
export function savingsQuote(
  balanceEUR: number,
  depositCount: number
): StockQuote {
  return {
    symbol: SAVINGS_SYMBOL,
    price: depositCount > 0 ? balanceEUR / depositCount : balanceEUR,
    currency: 'EUR',
    change: 0,
    changePercent: 0,
    marketCap: 0,
    name: 'Livret A',
  }
}


/**
 * Cash in hand. No interest and no market price: the amount held is exactly
 * what was put in, so value and cost basis are the same figure.
 */
export function buildCashMovement(
  date: string,
  amountEUR: number
): Transaction {
  return {
    id: makeTransactionId({
      account: 'cash',
      orderRef: `${CASH_SYMBOL}-${date}`,
      date,
      time: '00:00:00',
      isin: CASH_SYMBOL,
      quantity: amountEUR,
      price: 1,
      amountEUR,
    }),
    account: 'cash',
    date,
    time: '00:00:00',
    isin: '',
    symbol: CASH_SYMBOL,
    productName: 'Cash (billets)',
    quantity: 1,
    price: amountEUR,
    currency: 'EUR',
    grossLocal: amountEUR,
    amountEUR,
    brokerFeesEUR: 0,
    fxFeesEUR: 0,
    feesEUR: 0,
    orderRef: `${CASH_SYMBOL}-${date}-${amountEUR}`,
    source: 'Saisie manuelle',
  }
}

export function cashQuote(balanceEUR: number, moveCount: number): StockQuote {
  return {
    symbol: CASH_SYMBOL,
    price: moveCount > 0 ? balanceEUR / moveCount : balanceEUR,
    currency: 'EUR',
    change: 0,
    changePercent: 0,
    marketCap: 0,
    name: 'Cash (billets)',
  }
}

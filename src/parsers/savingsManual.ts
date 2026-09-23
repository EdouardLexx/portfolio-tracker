import type { Transaction, StockQuote } from '../types'
import { SAVINGS_SYMBOL, CASH_SYMBOL } from '../types'
import { makeTransactionId } from './shared'

export interface SavingsBalance {
  balanceEUR: number
  updatedAt: string
}

/**
 * A deposit is one "unit" per euro paid in, so the cost basis is simply the
 * sum of what was paid. The current value comes from the balance the user
 * reads off their bank, which is why the position holds a single unit priced
 * at that balance rather than a unit per euro.
 */
export function buildSavingsDeposit(
  date: string,
  amountEUR: number
): Transaction {
  return {
    id: makeTransactionId({
      account: 'savings',
      orderRef: `${SAVINGS_SYMBOL}-${date}`,
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
    orderRef: `${SAVINGS_SYMBOL}-${date}-${amountEUR}`,
    source: 'Saisie manuelle',
  }
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

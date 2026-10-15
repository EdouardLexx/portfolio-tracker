import Papa from 'papaparse'
import type { Transaction, ParseResult } from '../types'
import { makeTransactionId, sortTransactionsDesc } from './shared'

/** Trade Republic "Transaction export": securities and cash account in one file. */
export function isTradeRepublicCsv(csvText: string): boolean {
  const header = csvText.split('\n')[0] ?? ''
  return ['account_type', 'asset_class', 'transaction_id', 'original_currency'].every((h) =>
    header.includes(h)
  )
}

interface Event {
  kind: 'buy' | 'sell' | 'adjust' | 'fee'
  stamp: string
  date: string
  time: string
  isin: string
  name: string
  shares: number // signed, as the file gives it
  price: number
  gross: number
  broker: number
  tax: number
  ref: string
}

const num = (v: string | undefined) => {
  const n = parseFloat(v ?? '')
  return Number.isFinite(n) ? n : 0
}

/** Fractional shares go to six decimals: anything below is rounding dust. */
const DUST = 1e-7

/**
 * Buys and sales of the securities account, as they happened: sales carry a
 * negative quantity and bring in their proceeds net of fees. Fees and the
 * French transaction tax are part of a buy's cost, as on the PEA. Dividends,
 * interest and the cash account (transfers, card) are not tracked.
 */
export function parseTradeRepublicCsv(csvText: string, fileName: string): ParseResult {
  if (!isTradeRepublicCsv(csvText)) {
    return {
      transactions: [],
      warnings: [`${fileName} : ce n'est pas un export Trade Republic.`],
    }
  }

  const rows = Papa.parse(csvText, { header: true, skipEmptyLines: true }).data as Record<
    string,
    string
  >[]

  const events: Event[] = []
  let dividends = 0
  let unknown = 0
  for (const r of rows) {
    const category = r.category ?? ''
    const type = r.type ?? ''
    if (category === 'CASH' && type === 'DIVIDEND') dividends++
    const isin = (r.symbol ?? '').trim().toUpperCase()
    const shares = num(r.shares)
    // An IPO subscription is paid (with its fee) days before the shares come.
    const ipoFee = type === 'IPO_SUBSCRIPTION' && Math.abs(num(r.fee))
    if (!isin || (!shares && !ipoFee) || (category === 'CASH' && !ipoFee)) continue

    const kind =
      category === 'TRADING' && type === 'BUY'
        ? 'buy'
        : category === 'TRADING' && type === 'SELL'
          ? 'sell'
          : category === 'CORPORATE_ACTION'
            ? 'adjust'
            : ipoFee
              ? 'fee'
              : null
    if (!kind) {
      unknown++
      continue
    }
    const price = num(r.price)
    // A subscription filled at an IPO leaves the amount blank.
    const gross = Math.abs(num(r.amount)) || Math.abs(shares) * price
    events.push({
      kind,
      stamp: r.datetime ?? '',
      date: r.date || (r.datetime ?? '').slice(0, 10),
      time: (r.datetime ?? '').slice(11, 19) || '00:00:00',
      isin,
      name: (r.name ?? '').trim() || isin,
      shares,
      price,
      gross,
      broker: Math.abs(num(r.fee)),
      tax: Math.abs(num(r.tax)),
      ref: r.transaction_id ?? '',
    })
  }

  const byIsin = new Map<string, Event[]>()
  for (const e of events) byIsin.set(e.isin, [...(byIsin.get(e.isin) ?? []), e])

  const transactions: Transaction[] = []
  let sales = 0
  const push = (e: Event, quantity: number, gross: number, broker: number, tax: number) => {
    const sale = quantity < 0
    const feesEUR = broker + tax
    const amountEUR = sale ? -(gross - feesEUR) : gross + feesEUR
    transactions.push({
      id: makeTransactionId({
        account: 'traderepublic',
        orderRef: e.ref,
        date: e.date,
        time: e.time,
        isin: e.isin,
        quantity,
        price: e.price,
        amountEUR,
      }),
      account: 'traderepublic',
      date: e.date,
      time: e.time,
      isin: e.isin,
      productName: e.name,
      quantity,
      price: e.price,
      currency: 'EUR',
      grossLocal: sale ? -gross : gross,
      amountEUR,
      brokerFeesEUR: broker,
      fxFeesEUR: 0,
      feesEUR,
      orderRef: e.ref,
      source: fileName,
    })
  }

  for (const list of byIsin.values()) {
    list.sort((a, b) => a.stamp.localeCompare(b.stamp))
    let pendingFee = 0
    for (const e of list) {
      if (e.kind === 'fee') {
        pendingFee += e.broker
      } else if (e.kind === 'buy') {
        push(e, e.shares, e.gross, e.broker + pendingFee, e.tax)
        pendingFee = 0
      } else if (e.kind === 'sell') {
        sales++
        push(e, -Math.abs(e.shares), e.gross, e.broker, e.tax)
      }
    }

    // Free shares come with cancellations booked out of order, some after the
    // sale that closed the line: only their net counts, as a free buy on the
    // day of the first grant.
    const actions = list.filter((e) => e.kind === 'adjust')
    const net = actions.reduce((sum, e) => sum + e.shares, 0)
    const grant = actions.find((e) => e.shares > 0)
    if (net > DUST && grant) push(grant, net, 0, 0, 0)
  }

  const s = (n: number) => (n > 1 ? 's' : '')
  const warnings: string[] = []
  if (sales) {
    warnings.push(`${fileName} : ${sales} vente${s(sales)} prise${s(sales)} en compte.`)
  }
  if (dividends) {
    warnings.push(`${fileName} : ${dividends} dividende${s(dividends)} ignoré${s(dividends)}.`)
  }
  if (unknown) {
    warnings.push(`${fileName} : ${unknown} opération${s(unknown)} sur titres non reconnue${s(unknown)}, ignorée${s(unknown)}.`)
  }
  warnings.push(
    `${fileName} : le compte espèces (virements, intérêts, carte) n'est pas suivi.`
  )

  // Older versions of this parser stored scaled-down buys; this file's lines
  // replace them.
  const supersedes = [...new Set(events.map((e) => e.ref))]
  return { transactions: sortTransactionsDesc(transactions), warnings, supersedes }
}

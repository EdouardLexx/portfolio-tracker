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
 * The export is the full history of the account, sales included, while the
 * app models buys only. Sold shares are therefore taken out here: for each
 * security, only the buys since it was last fully sold are kept, scaled down
 * to the quantity still held and to its remaining cost at the weighted
 * average price (the French rule for a securities account).
 *
 * Fees and the French transaction tax are part of the cost, as on the PEA.
 * Dividends, interest and the cash account (transfers, card) are not tracked.
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
  const covered: string[] = []
  let sales = 0
  let closed = 0

  for (const list of byIsin.values()) {
    list.sort((a, b) => a.stamp.localeCompare(b.stamp))
    for (const e of list) if (e.kind === 'buy') covered.push(e.ref)
    sales += list.filter((e) => e.kind === 'sell').length

    let held = 0
    let cost = 0
    let period: Event[] = []
    let pendingFee = 0
    for (const e of list) {
      if (e.kind === 'fee') {
        pendingFee += e.broker
        continue
      }
      if (e.kind === 'buy') {
        e.broker += pendingFee
        pendingFee = 0
        held += e.shares
        cost += e.gross + e.broker + e.tax
        period.push(e)
      } else if (e.kind === 'sell') {
        const sold = Math.abs(e.shares)
        if (held > DUST) cost -= (cost / held) * Math.min(sold, held)
        held -= sold
      } else {
        // Free shares and their cancellations: quantity only, no cost.
        held += e.shares
      }
      if (held <= DUST) {
        held = 0
        cost = 0
        period = []
      }
    }

    // The file books some corporate actions after the sale that closed the
    // line; what counts is the net of every movement.
    const net = list.reduce((sum, e) => sum + e.shares, 0)
    if (net <= DUST || !period.length) {
      if (list.some((e) => e.kind === 'buy')) closed++
      continue
    }
    held = Math.min(held, net)

    const bought = period.reduce((s, e) => s + e.shares, 0)
    const paid = period.reduce((s, e) => s + e.gross + e.broker + e.tax, 0)
    const qtyShare = held / bought
    const costShare = paid > 0 ? cost / paid : 0
    for (const e of period) {
      const quantity = e.shares * qtyShare
      const brokerFeesEUR = e.broker * costShare
      const feesEUR = (e.broker + e.tax) * costShare
      const grossLocal = e.gross * costShare
      const amountEUR = grossLocal + feesEUR
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
        grossLocal,
        amountEUR,
        brokerFeesEUR,
        fxFeesEUR: 0,
        feesEUR,
        orderRef: e.ref,
        source: fileName,
      })
    }
  }

  const s = (n: number) => (n > 1 ? 's' : '')
  const warnings: string[] = []
  if (sales) {
    warnings.push(
      `${fileName} : ${sales} vente${s(sales)} prise${s(sales)} en compte : seuls les titres encore détenus sont gardés, au prix de revient moyen${
        closed ? ` (${closed} titre${s(closed)} entièrement vendu${s(closed)})` : ''
      }.`
    )
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

  return { transactions: sortTransactionsDesc(transactions), warnings, supersedes: covered }
}

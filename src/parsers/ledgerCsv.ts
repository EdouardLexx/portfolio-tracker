import Papa from 'papaparse'
import type { Transaction, ParseResult } from '../types'
import { makeTransactionId } from './shared'
import { fetchHistory } from '../api/stockApi'

/** Ledger Live "operations" export. */
export function isLedgerCsv(csvText: string): boolean {
  const header = csvText.split('\n')[0] ?? ''
  return (
    /Operation\s*Date/i.test(header) &&
    /Currency\s*Ticker/i.test(header) &&
    /Operation\s*Type/i.test(header)
  )
}

interface Row {
  date: string
  time: string
  status: string
  ticker: string
  type: string
  amount: number
  fees: number
  hash: string
  accountName: string
  cvTicker: string
  cvAtDate: number
}

function readRows(csvText: string): Row[] {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })
  const rows = parsed.data as Record<string, string>[]

  return rows
    .filter((r) => r['Operation Date'] && r['Currency Ticker'])
    .map((r) => {
      const stamp = r['Operation Date']
      return {
        date: stamp.slice(0, 10),
        time: stamp.slice(11, 19) || '00:00:00',
        status: r['Status'] ?? '',
        ticker: (r['Currency Ticker'] ?? '').trim().toUpperCase(),
        type: (r['Operation Type'] ?? '').trim().toUpperCase(),
        amount: parseFloat(r['Operation Amount'] ?? '0') || 0,
        fees: parseFloat(r['Operation Fees'] ?? '0') || 0,
        hash: r['Operation Hash'] ?? '',
        accountName: r['Account Name'] ?? '',
        cvTicker: (r['Countervalue Ticker'] ?? 'USD').trim().toUpperCase(),
        cvAtDate: parseFloat(r['Countervalue at Operation Date'] ?? '0') || 0,
      }
    })
}

/**
 * Ledger reports the value of each operation in a counter-currency (USD by
 * default), so the euro cost basis needs that day's rate, not today's. One
 * history call covers the whole file.
 */
async function buildRateLookup(
  currency: string,
  from: string
): Promise<(date: string) => number> {
  if (currency === 'EUR') return () => 1

  try {
    const history = await fetchHistory(`EUR${currency}=X`, from)
    const byDate = new Map(history.map((d) => [d.date, d.close]))
    const dates = [...byDate.keys()].sort()

    return (date: string) => {
      const exact = byDate.get(date)
      if (exact) return exact
      // Weekends and holidays have no quote: fall back to the last one before.
      let last = 0
      for (const d of dates) {
        if (d > date) break
        last = byDate.get(d) ?? last
      }
      return last || 0
    }
  } catch {
    return () => 0
  }
}

export async function parseLedgerCsv(
  csvText: string,
  fileName: string
): Promise<ParseResult> {
  const warnings: string[] = []

  if (!isLedgerCsv(csvText)) {
    return {
      transactions: [],
      warnings: [
        `${fileName} : en-têtes Ledger introuvables, ce n'est pas un export Ledger Live.`,
      ],
    }
  }

  const rows = readRows(csvText)
  if (!rows.length) {
    return {
      transactions: [],
      warnings: [`${fileName} : aucune opération lisible.`],
    }
  }

  const incoming = rows.filter((r) => r.type === 'IN')
  const outgoing = rows.filter((r) => r.type === 'OUT')
  const pending = rows.filter((r) => r.status && r.status !== 'Confirmed')

  if (outgoing.length) {
    warnings.push(
      `${fileName} : ${outgoing.length} envoi(s) « OUT » ignoré(s) — les sorties ne sont pas encore gérées.`
    )
  }
  if (pending.length) {
    warnings.push(
      `${fileName} : ${pending.length} opération(s) non confirmée(s) ignorée(s).`
    )
  }

  const usable = incoming.filter(
    (r) => (!r.status || r.status === 'Confirmed') && r.amount > 0
  )
  if (!usable.length) {
    return { transactions: [], warnings }
  }

  const from = usable.map((r) => r.date).sort()[0]
  const counterCurrency = usable[0].cvTicker || 'USD'
  const rateAt = await buildRateLookup(counterCurrency, from)

  const transactions: Transaction[] = []
  let unpriced = 0

  for (const r of usable) {
    const rate = rateAt(r.date)
    if (!rate) {
      unpriced++
      continue
    }

    // The unit price is implied by the operation's own countervalue, which
    // also lets us price the network fee without a second lookup.
    const unitPriceCv = r.amount > 0 ? r.cvAtDate / r.amount : 0
    const costEUR = r.cvAtDate / rate
    const feesEUR = (r.fees * unitPriceCv) / rate
    const symbol = `${r.ticker}-EUR`

    transactions.push({
      id: makeTransactionId({
        account: 'ledger',
        orderRef: r.hash,
        date: r.date,
        time: r.time,
        isin: r.ticker,
        quantity: r.amount,
        price: unitPriceCv / rate,
        amountEUR: costEUR + feesEUR,
      }),
      account: 'ledger',
      date: r.date,
      time: r.time,
      isin: '',
      symbol,
      productName: r.ticker,
      quantity: r.amount,
      price: unitPriceCv / rate,
      currency: 'EUR',
      grossLocal: costEUR,
      amountEUR: costEUR + feesEUR,
      brokerFeesEUR: 0,
      fxFeesEUR: feesEUR,
      feesEUR,
      orderRef: r.hash,
      source: fileName,
    })
  }

  if (unpriced) {
    warnings.push(
      `${fileName} : ${unpriced} opération(s) sans taux de change disponible, ignorée(s).`
    )
  }

  return { transactions, warnings }
}

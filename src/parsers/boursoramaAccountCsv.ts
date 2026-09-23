import Papa from 'papaparse'
import type { Transaction, ParseResult } from '../types'
import { SAVINGS_SYMBOL } from '../types'
import { parseFrenchNumber, makeTransactionId } from './shared'

/**
 * Boursorama account-operations export (the "export-operations-*.csv" of a
 * Livret A). Semicolon separated, and it ships two columns both named
 * "Solde": the first is the amount of the operation, the last the running
 * balance.
 */
export function isBoursoramaAccountCsv(csvText: string): boolean {
  const header = csvText.split('\n')[0] ?? ''
  return (
    /Date\s*Op[ée]ration/i.test(header) && /Libell[ée]\s*Compte/i.test(header)
  )
}

const COL = {
  date: 0,
  valueDate: 1,
  label: 2,
  category: 4,
  amount: 6,
  accountNumber: 8,
  accountLabel: 9,
  balance: 10,
}

/** Yearly interest posting, as opposed to a transfer in or out. */
function isInterestRow(label: string, category: string): boolean {
  return (
    /INTER\.?\s*BRUTS/i.test(label) ||
    /int[ée]r[êe]ts?\s+bruts/i.test(label) ||
    /épargne bancaire/i.test(category)
  )
}

export function parseBoursoramaAccountCsv(
  csvText: string,
  fileName: string
): ParseResult {
  const warnings: string[] = []

  if (!isBoursoramaAccountCsv(csvText)) {
    return {
      transactions: [],
      warnings: [
        `${fileName} : en-têtes Boursorama introuvables, ce n'est pas un export d'opérations.`,
      ],
    }
  }

  const parsed = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
    delimiter: ';',
  })
  const rows = (parsed.data as string[][]).slice(1)

  const usable = rows.filter(
    (r) => r.length > COL.balance && /^\d{4}-\d{2}-\d{2}$/.test(r[COL.date])
  )
  if (!usable.length) {
    return {
      transactions: [],
      warnings: [`${fileName} : aucune opération lisible.`],
    }
  }

  const accounts = [...new Set(usable.map((r) => r[COL.accountLabel]))]
  if (accounts.length > 1) {
    warnings.push(
      `${fileName} : le fichier mélange ${accounts.length} comptes (${accounts.join(', ')}) ; tout est rattaché au Livret A.`
    )
  }

  const transactions: Transaction[] = []
  // Same-day operations can repeat amount and label, so a running index keeps
  // their identities distinct without making re-imports look new.
  const seenPerDay = new Map<string, number>()

  for (const r of usable) {
    const date = r[COL.date]
    const label = r[COL.label] ?? ''
    const category = r[COL.category] ?? ''
    const amount = parseFrenchNumber(r[COL.amount])
    if (!amount) continue

    const interest = isInterestRow(label, category)
    const key = `${date}|${label}|${amount}`
    const seq = (seenPerDay.get(key) ?? 0) + 1
    seenPerDay.set(key, seq)

    const orderRef = `${SAVINGS_SYMBOL}-${date}-${amount}-${seq}`

    transactions.push({
      id: makeTransactionId({
        account: 'savings',
        orderRef,
        date,
        time: '00:00:00',
        isin: SAVINGS_SYMBOL,
        quantity: interest ? 0 : 1,
        price: amount,
        amountEUR: interest ? 0 : amount,
      }),
      account: 'savings',
      date,
      time: '00:00:00',
      isin: '',
      symbol: SAVINGS_SYMBOL,
      productName: interest ? 'Intérêts Livret A' : 'Livret A',
      // Interest is inert for the cost basis: no unit, no amount paid in.
      quantity: interest ? 0 : 1,
      price: amount,
      currency: 'EUR',
      grossLocal: amount,
      amountEUR: interest ? 0 : amount,
      brokerFeesEUR: 0,
      fxFeesEUR: 0,
      feesEUR: 0,
      ...(interest ? { interestEUR: amount } : {}),
      orderRef,
      source: fileName,
    })
  }

  // Boursorama's balance column is filled inconsistently when several
  // operations share a date, so the operations are treated as the truth and
  // any gap is surfaced rather than silently resolved.
  const computed = transactions.reduce(
    (s, t) => s + t.amountEUR + (t.interestEUR ?? 0),
    0
  )
  const stated = parseFrenchNumber(usable[0][COL.balance])
  if (stated && Math.abs(stated - computed) > 1) {
    warnings.push(
      `${fileName} : le solde calculé depuis les opérations (${computed.toFixed(2)} €) diffère de la colonne « Solde » du fichier (${stated.toFixed(2)} €). Les opérations font foi ; vérifie auprès de ta banque si l'écart te surprend.`
    )
  }

  return { transactions, warnings }
}

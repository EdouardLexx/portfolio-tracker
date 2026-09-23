import Papa from 'papaparse'
import type { Transaction, ParseResult } from '../types'
import { parseFrenchNumber, makeTransactionId } from './shared'

/** DEGIRO "Transactions" export: one row per execution line. */
export function isDegiroCsv(csvText: string): boolean {
  const header = csvText.split('\n')[0]?.toUpperCase() ?? ''
  return header.includes('DATE') && header.includes('PRODUIT')
}

export function parseDegiroCsv(csvText: string, fileName: string): ParseResult {
  const warnings: string[] = []

  if (!isDegiroCsv(csvText)) {
    return {
      transactions: [],
      warnings: [
        `${fileName} : en-têtes « Date » / « Produit » introuvables, ce n'est pas un export DEGIRO.`,
      ],
    }
  }

  const result = Papa.parse(csvText, { header: false, skipEmptyLines: true })
  const rows = result.data as string[][]

  const transactions: Transaction[] = []
  let skippedSales = 0

  for (const row of rows.slice(1)) {
    if (!row[0] || !row[2] || !row[6]) continue

    const quantity = parseInt(row[6], 10)
    if (!Number.isFinite(quantity)) continue
    if (quantity < 0) {
      skippedSales++
      continue
    }

    const [dd, mm, yyyy] = row[0].split('-')
    const date = `${yyyy}-${mm}-${dd}`

    const price = parseFrenchNumber(row[7])
    const currency = row[8] || 'EUR'
    const grossLocal = Math.abs(parseFrenchNumber(row[9]))
    const amountEUR = Math.abs(parseFrenchNumber(row[11]))
    const fxFeesEUR = Math.abs(parseFrenchNumber(row[13]))
    const brokerFeesEUR = Math.abs(parseFrenchNumber(row[14]))
    const orderRef = row[16] || `${date}-${row[3]}`

    transactions.push({
      id: makeTransactionId({
        account: 'degiro',
        orderRef,
        date,
        time: row[1] || '00:00:00',
        isin: row[3],
        quantity,
        price,
        amountEUR,
      }),
      account: 'degiro',
      date,
      time: row[1] || '00:00:00',
      isin: row[3],
      productName: row[2],
      quantity,
      price,
      currency,
      grossLocal,
      amountEUR,
      brokerFeesEUR,
      fxFeesEUR,
      feesEUR: brokerFeesEUR + fxFeesEUR,
      orderRef,
      source: fileName,
    })
  }

  if (skippedSales) {
    warnings.push(
      `${fileName} : ${skippedSales} vente(s) ignorée(s) — les ventes ne sont pas encore gérées.`
    )
  }

  return { transactions, warnings }
}

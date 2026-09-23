import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Transaction, ParseResult } from '../types'
import { parseFrenchNumber, makeTransactionId } from './shared'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * Boursorama "avis d'opéré" (OPERATION DE BOURSE) notices.
 *
 * One notice = one execution. We read the flattened text rather than the
 * table layout: the PDF has no real table structure, and label/value pairs
 * ("Cours exécuté : 12,3456 EUR") are reliable anchors, whereas column
 * positions shift between template versions.
 */

export async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise

  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(text)
  }
  doc.cleanup()

  return pages.join('\n')
}

export function isBoursoramaNotice(text: string): boolean {
  return (
    /OPERATION\s+DE\s+BOURSE/i.test(text) ||
    /Références de votre compte titres/i.test(text)
  )
}

/**
 * Reads the gross/net pair from the totals row. Fees are derived as
 * net − gross so commission and the French FTT always add up, whichever
 * of them the notice happens to print.
 */
function readTotals(flat: string): { gross: number; net: number } {
  const after = flat.split(/Montant net au débit de votre compte/i)[1] ?? ''
  const values = [
    ...after.matchAll(/(\d{1,3}(?:[\s.]\d{3})*,\d{2})(?!\d)\s*EUR/g),
  ].map((m) => parseFrenchNumber(m[1]))

  if (!values.length) return { gross: 0, net: 0 }
  return { gross: values[0], net: values[values.length - 1] }
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return m[1]
  }
  return null
}

export function parseBoursoramaNotice(
  text: string,
  fileName: string
): ParseResult {
  const warnings: string[] = []
  const flat = text.replace(/\s+/g, ' ').trim()

  if (!isBoursoramaNotice(flat)) {
    return {
      transactions: [],
      warnings: [`${fileName} : ce PDF n'est pas un avis d'opéré Boursorama.`],
    }
  }

  const isSale = /VENTE\s+COMPTANT/i.test(flat)
  if (isSale) {
    return {
      transactions: [],
      warnings: [
        `${fileName} : avis de VENTE — les ventes ne sont pas encore gérées, opération ignorée.`,
      ],
    }
  }

  const account = /Compte\s+PEA/i.test(flat) ? 'pea' : 'degiro'

  const isin = firstMatch(flat, [/Code ISIN\s*:?\s*([A-Z]{2}[A-Z0-9]{9}\d)/i])
  if (!isin) {
    return {
      transactions: [],
      warnings: [`${fileName} : code ISIN introuvable.`],
    }
  }

  // Execution date, then quantity, then the product name. The time sits
  // between date and quantity in pdf.js output but on its own line in other
  // extractors, so it is optional here.
  const execMatch = flat.match(
    /(\d{2}\/\d{2}\/\d{4})\s+(?:(\d{2}:\d{2}:\d{2})\s+)?(\d+)\s+(.+?)\s+Référence\s*:/i
  )
  const dateStr = execMatch?.[1] ?? null
  const quantity = execMatch ? parseInt(execMatch[3], 10) : NaN
  let productName = execMatch?.[4]?.trim() ?? ''

  const timeStr =
    execMatch?.[2] ?? firstMatch(flat, [/(\d{2}:\d{2}:\d{2})/]) ?? '00:00:00'

  const price = parseFrenchNumber(
    firstMatch(flat, [/Cours exécuté\s*:?\s*([\d .,]+?)\s*EUR/i])
  )

  // The totals row prints every label first, then every value, in the same
  // column order: gross, commission, [French FTT], net. So anchor on the last
  // label and read the trailing values rather than each label individually.
  const totals = readTotals(flat)
  const gross = totals.gross
  const net = totals.net
  const orderRef =
    firstMatch(flat, [/Référence\s*:?\s*(\d{6,})/i]) ?? `${dateStr}-${isin}`

  if (!dateStr || !Number.isFinite(quantity) || quantity <= 0) {
    return {
      transactions: [],
      warnings: [`${fileName} : date ou quantité illisible.`],
    }
  }
  if (!price) {
    return {
      transactions: [],
      warnings: [`${fileName} : cours exécuté illisible.`],
    }
  }

  // The product name sometimes swallows the "Type d'ordre" label; trim it.
  productName = productName
    .replace(/\s*Code ISIN.*$/i, '')
    .replace(/\s*Type d'ordre.*$/i, '')
    .trim()
  if (!productName) productName = isin

  const [dd, mm, yyyy] = dateStr.split('/')
  const date = `${yyyy}-${mm}-${dd}`

  const grossLocal = gross || quantity * price
  const amountEUR = net || grossLocal
  const fees = Math.max(0, Math.round((amountEUR - grossLocal) * 100) / 100)

  const tx: Transaction = {
    id: makeTransactionId({
      account,
      orderRef,
      date,
      time: timeStr,
      isin,
      quantity,
      price,
      amountEUR,
    }),
    account,
    date,
    time: timeStr,
    isin,
    productName,
    quantity,
    price,
    currency: 'EUR',
    grossLocal,
    amountEUR,
    brokerFeesEUR: fees,
    fxFeesEUR: 0,
    feesEUR: fees,
    orderRef,
    source: fileName,
  }

  return { transactions: [tx], warnings }
}

export async function parseBoursoramaPdf(file: File): Promise<ParseResult> {
  try {
    const text = await extractPdfText(file)
    return parseBoursoramaNotice(text, file.name)
  } catch (err) {
    return {
      transactions: [],
      warnings: [
        `${file.name} : lecture du PDF impossible (${
          err instanceof Error ? err.message : 'erreur inconnue'
        }).`,
      ],
    }
  }
}

import Papa from 'papaparse'

/**
 * A shareable sample of a bank export, to ask for a new parser: the layout
 * survives (columns, separator, date and number formats, operation codes),
 * the person's data does not (names, IBANs, amounts, references, free text).
 * Everything happens in the browser; the result is shown for review before
 * anything leaves.
 */
export interface CsvSample {
  /** The sample, in the file's own separator and quoting. */
  text: string
  delimiter: string
  rowCount: number
  columnCount: number
  sampleRows: number
  /** Code-like columns and every value they take in the whole file. */
  codes: { column: string; values: string[] }[]
  /** The file was not UTF-8 (typically Latin-1 from a French bank). */
  badEncoding: boolean
}

// Letters only: an IBAN, an ISIN or an account number is never a code.
const CODE = /^[A-Z][A-Z_]*$/
// Short labels like « Virements reçus » are kept only under such headers:
// a name repeated in a column would otherwise pass for a category.
const LABEL_HEADER = /type|cat[ée]gor|nature|sens|statut|status|devise|currency|class|op[ée]ration$/i
const LABEL = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' _-]{0,29}$/

const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})([T ])(\d{2}):(\d{2})(.*)$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DMY = /^(\d{2})([/.-])(\d{2})\2(\d{2}|\d{4})$/
const TIME = /^\d{2}:\d{2}(:\d{2})?$/
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9 ]{10,32}$/
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/
const NUMBER = /^[+-]?[\d\s\u00a0\u202f.,']*\d[\d\s\u00a0\u202f.,']*(\s?(€|EUR|USD|\$|%))?$/
const TOKEN = /^[A-Za-z0-9*#_/.:-]*\d[A-Za-z0-9*#_/.:-]*$/

/** Well-known securities, one per common country prefix, to stand in for ISINs. */
const PUBLIC_ISIN: Record<string, string> = {
  US: 'US0378331005',
  FR: 'FR0000120271',
  IE: 'IE00B4L5Y983',
  LU: 'LU1681043599',
  NL: 'NL0010273215',
  DE: 'DE0007164600',
}

/** Small deterministic generator: the same file always gives the same sample. */
function digits(seed: number) {
  let x = seed || 1
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    return x
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Same shape, other characters: digits stay digits, letters stay letters. */
function scramble(value: string, next: () => number, keepZeros = false): string {
  return value.replace(/[0-9a-zA-Z]/g, (c) => {
    if (/\d/.test(c)) return keepZeros && c === '0' ? '0' : String(1 + (next() % 9))
    const letter = String.fromCharCode(97 + (next() % 26))
    return c === c.toUpperCase() ? letter.toUpperCase() : letter
  })
}

function fakeDate(value: string, row: number): string | null {
  const month = pad((row % 12) + 1)
  const day = pad((row % 27) + 1)
  let m = ISO_DATETIME.exec(value)
  if (m) return `2024-${month}-${day}${m[4]}10:30${m[7].replace(/\d/g, '0')}`
  m = ISO_DATE.exec(value)
  if (m) return `2024-${month}-${day}`
  m = DMY.exec(value)
  if (m) return `${day}${m[2]}${month}${m[2]}${m[4].length === 4 ? '2024' : '24'}`
  return null
}

export function anonymizeCsv(input: string, maxRows = 15): CsvSample | { error: string } {
  const badEncoding = input.includes('\uFFFD')
  const parsed = Papa.parse<string[]>(input.replace(/^\uFEFF/, ''), { skipEmptyLines: true })
  const all = parsed.data.filter((r) => r.some((c) => c.trim()))
  if (all.length < 2) return { error: 'Fichier vide ou illisible : il faut un CSV avec des lignes.' }
  const delimiter = parsed.meta.delimiter

  // The header is the first row as wide as most rows; what comes before it
  // (account holder, period) is preamble.
  const widths = new Map<number, number>()
  for (const r of all) widths.set(r.length, (widths.get(r.length) ?? 0) + 1)
  const width = [...widths.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const headerAt = all.findIndex((r) => r.length === width)
  const preamble = all.slice(0, headerAt)
  const header = all[headerAt]
  const rows = all.slice(headerAt + 1)
  if (!rows.length) return { error: 'Aucune ligne de données sous les en-têtes.' }

  const kept = header.map((name, col) => {
    const values = rows.map((r) => (r[col] ?? '').trim()).filter(Boolean)
    if (!values.length) return false
    if (values.every((v) => CODE.test(v) && v.length <= 40)) return true
    const distinct = new Set(values)
    return (
      LABEL_HEADER.test(name) &&
      distinct.size <= 12 &&
      distinct.size * 3 <= values.length &&
      values.every((v) => LABEL.test(v))
    )
  })

  const codes = header
    .map((column, col) => ({
      column,
      values: [...new Set(rows.map((r) => (r[col] ?? '').trim()).filter(Boolean))].sort(),
    }))
    .filter((_, col) => kept[col])

  // Every kind of operation first, so a rare one (a sale, a dividend) shows.
  const picked = new Set<number>()
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    const key = header.map((_, col) => (kept[col] ? r[col] : '')).join('\u0000')
    if (!seen.has(key) && picked.size < maxRows) {
      seen.add(key)
      picked.add(i)
    }
  })
  for (let i = 0; i < rows.length && picked.size < maxRows; i++) picked.add(i)

  const next = digits(input.length)
  const texts = new Map<string, string>()
  const cell = (value: string, col: number, row: number): string => {
    const v = value.trim()
    if (!v || (col >= 0 && kept[col]) || TIME.test(v)) return value
    const date = fakeDate(v, row)
    if (date) return date
    if (ISIN.test(v) && !/^\d+$/.test(v)) return PUBLIC_ISIN[v.slice(0, 2)] ?? scramble(v, next)
    if (IBAN.test(v)) return v.slice(0, 2) + scramble(v.slice(2), next)
    if (NUMBER.test(v)) return scramble(v, next, true)
    if (TOKEN.test(v)) return scramble(v, next)
    if (!texts.has(v)) texts.set(v, `Texte ${texts.size + 1}`)
    return texts.get(v)!
  }

  const sample = [
    ...preamble.map((r) => r.map((c) => cell(c, -1, 0))),
    header,
    ...rows.flatMap((r, i) => (picked.has(i) ? [r.map((c, col) => cell(c, col, i))] : [])),
  ]
  const quoted = /^\uFEFF?"/.test(input)
  return {
    text: Papa.unparse(sample, { delimiter, quotes: quoted, newline: '\n' }),
    delimiter,
    rowCount: rows.length,
    columnCount: header.length,
    sampleRows: picked.size,
    codes,
    badEncoding,
  }
}

import type { Transaction, ImportRecord, SymbolInfo, Loan } from '../types'
import type { SavingsBalance } from '../parsers/savingsManual'

const KEY_TX = 'portfolio.transactions.v2'
const KEY_IMPORTS = 'portfolio.imports.v2'
const KEY_SYMBOLS = 'portfolio.symbols.v1'
const KEY_SAVINGS = 'portfolio.savings.v1'
const KEY_LOANS = 'portfolio.loans.v1'
const LEGACY_KEYS = [
  'portfolio.transactions.v1',
  'portfolio.imports.v1',
  'portfolio.tickerOverrides.v1',
]

/**
 * localStorage can throw outright (private mode, blocked site data), so every
 * read and write is guarded and falls back to an empty value.
 */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function loadTransactions(): Transaction[] | null {
  const stored = read<Transaction[] | null>(KEY_TX, null)
  return Array.isArray(stored) ? stored : null
}

export function saveTransactions(txs: Transaction[]): boolean {
  return write(KEY_TX, txs)
}

export function loadImports(): ImportRecord[] {
  return read<ImportRecord[]>(KEY_IMPORTS, [])
}

export function saveImports(records: ImportRecord[]): boolean {
  return write(KEY_IMPORTS, records)
}

export function loadSymbols(): Record<string, SymbolInfo> {
  return read<Record<string, SymbolInfo>>(KEY_SYMBOLS, {})
}

export function saveSymbols(map: Record<string, SymbolInfo>): boolean {
  return write(KEY_SYMBOLS, map)
}

export function loadSavings(): SavingsBalance | null {
  return read<SavingsBalance | null>(KEY_SAVINGS, null)
}

export function saveSavings(balance: SavingsBalance): boolean {
  return write(KEY_SAVINGS, balance)
}

export function clearSavings() {
  try {
    localStorage.removeItem(KEY_SAVINGS)
  } catch {
    /* nothing we can do */
  }
}

export function loadLoans(): Loan[] {
  const stored = read<Loan[] | null>(KEY_LOANS, null)
  return Array.isArray(stored) ? stored : []
}

export function saveLoans(loans: Loan[]): boolean {
  return write(KEY_LOANS, loans)
}

/** Drops the v1 keys once the v2 model is in place. */
export function clearLegacyData() {
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* nothing we can do */
    }
  }
}

export function clearAllData() {
  for (const key of [
    KEY_TX,
    KEY_IMPORTS,
    KEY_SYMBOLS,
    KEY_SAVINGS,
    KEY_LOANS,
    ...LEGACY_KEYS,
  ]) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* nothing we can do */
    }
  }
}

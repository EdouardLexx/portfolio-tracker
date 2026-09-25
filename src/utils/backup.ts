import type { ImportRecord, Loan, SymbolInfo, Transaction } from '../types'
import { ACCOUNTS, LOAN_KINDS } from '../types'
import type { SavingsBalance } from '../parsers/savingsManual'
import { mergeTransactions, sortTransactionsDesc } from '../parsers/shared'

/**
 * Everything the portfolio is made of, as saved to a file. Preferences
 * (theme, discreet mode) belong to each device and are left out.
 */
export interface BackupData {
  transactions: Transaction[]
  imports: ImportRecord[]
  symbols: Record<string, SymbolInfo>
  savings: SavingsBalance | null
  loans: Loan[]
}

export interface Backup {
  app: typeof BACKUP_APP
  /** Bumped when the file layout changes, so an older app can refuse it. */
  version: number
  exportedAt: string
  data: BackupData
}

const BACKUP_APP = 'portfolio-tracker'
const BACKUP_VERSION = 1

export function createBackup(data: BackupData, now = new Date()): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data }
}

// ---------------------------------------------------------------------------
// Reading a file

const DATE = /^\d{4}-\d{2}-\d{2}$/
const ACCOUNT_KINDS = new Set<string>(ACCOUNTS.map((a) => a.kind))
const KINDS = new Set<string>(LOAN_KINDS.map((k) => k.kind))

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isString = (v: unknown): v is string => typeof v === 'string'

function isTransaction(v: unknown): v is Transaction {
  if (!isObject(v)) return false
  return (
    ['id', 'time', 'isin', 'productName', 'currency', 'orderRef', 'source'].every((k) =>
      isString(v[k])
    ) &&
    isString(v.account) &&
    ACCOUNT_KINDS.has(v.account) &&
    isString(v.date) &&
    DATE.test(v.date) &&
    ['quantity', 'price', 'grossLocal', 'amountEUR', 'brokerFeesEUR', 'fxFeesEUR', 'feesEUR'].every(
      (k) => isNumber(v[k])
    ) &&
    (v.symbol === undefined || isString(v.symbol)) &&
    (v.interestEUR === undefined || isNumber(v.interestEUR))
  )
}

function isLoan(v: unknown): v is Loan {
  if (!isObject(v)) return false
  return (
    isString(v.id) &&
    isString(v.name) &&
    isString(v.lender) &&
    isString(v.kind) &&
    KINDS.has(v.kind) &&
    isNumber(v.principalEUR) &&
    v.principalEUR > 0 &&
    isNumber(v.annualRatePercent) &&
    Number.isInteger(v.durationMonths) &&
    (v.durationMonths as number) >= 1 &&
    isString(v.startDate) &&
    DATE.test(v.startDate) &&
    (v.repayment === 'amortizing' || v.repayment === 'bullet') &&
    (v.deferral === 'none' || v.deferral === 'partial' || v.deferral === 'total') &&
    Number.isInteger(v.deferralMonths) &&
    isNumber(v.insuranceMonthlyEUR) &&
    isNumber(v.feesEUR) &&
    (v.bankPaymentEUR === null || isNumber(v.bankPaymentEUR))
  )
}

function isImportRecord(v: unknown): v is ImportRecord {
  return (
    isObject(v) &&
    isString(v.id) &&
    isString(v.fileName) &&
    isString(v.importedAt) &&
    isString(v.account) &&
    ACCOUNT_KINDS.has(v.account)
  )
}

function isSymbolInfo(v: unknown): v is SymbolInfo {
  return isObject(v) && isString(v.isin) && isString(v.symbol)
}

function isSavingsBalance(v: unknown): v is SavingsBalance {
  return isObject(v) && isNumber(v.balanceEUR) && isString(v.updatedAt)
}

/**
 * Reads a backup file. Every line is checked before anything is restored:
 * one malformed transaction would otherwise break every calculation.
 */
export function parseBackup(text: string): { backup: Backup } | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { error: "Ce fichier n'est pas une sauvegarde lisible (JSON invalide)." }
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP || !isObject(raw.data)) {
    return { error: "Ce fichier n'est pas une sauvegarde de Portefeuille." }
  }
  if (!Number.isInteger(raw.version) || (raw.version as number) < 1) {
    return { error: 'Version de sauvegarde inconnue.' }
  }
  if ((raw.version as number) > BACKUP_VERSION) {
    return {
      error:
        "Cette sauvegarde vient d'une version plus récente de l'application : mets-la à jour, puis réessaie.",
    }
  }

  const { transactions, imports = [], symbols = {}, savings = null, loans = [] } = raw.data
  if (!Array.isArray(transactions)) return { error: 'Sauvegarde incomplète : transactions absentes.' }
  const badTx = transactions.findIndex((t) => !isTransaction(t))
  if (badTx >= 0) return { error: `Sauvegarde abîmée : transaction n° ${badTx + 1} illisible.` }
  if (!Array.isArray(loans) || !loans.every(isLoan)) {
    return { error: 'Sauvegarde abîmée : un emprunt est illisible.' }
  }
  if (!Array.isArray(imports) || !imports.every(isImportRecord)) {
    return { error: "Sauvegarde abîmée : l'historique des imports est illisible." }
  }
  if (!isObject(symbols) || !Object.values(symbols).every(isSymbolInfo)) {
    return { error: 'Sauvegarde abîmée : les symboles sont illisibles.' }
  }
  if (savings !== null && !isSavingsBalance(savings)) {
    return { error: 'Sauvegarde abîmée : le solde du Livret A est illisible.' }
  }

  return {
    backup: {
      app: BACKUP_APP,
      version: raw.version as number,
      exportedAt: isString(raw.exportedAt) ? raw.exportedAt : '',
      data: {
        transactions: sortTransactionsDesc(transactions),
        imports,
        symbols: symbols as Record<string, SymbolInfo>,
        savings,
        loans,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Merging into what is already there

export interface MergeResult {
  data: BackupData
  addedTransactions: number
  knownTransactions: number
  addedLoans: number
}

/**
 * Adds what the file has and this device lacks, and changes nothing that
 * already exists. Transactions go through the import deduplication, so a
 * line present on both sides is kept once and split fills stay counted.
 * A deletion made on one device is therefore not carried over: to mirror a
 * device exactly, restore instead of merging.
 */
export function mergeBackup(current: BackupData, incoming: BackupData): MergeResult {
  const { merged, added, duplicates } = mergeTransactions(
    current.transactions,
    incoming.transactions
  )
  const loanIds = new Set(current.loans.map((l) => l.id))
  const newLoans = incoming.loans.filter((l) => !loanIds.has(l.id))
  const importIds = new Set(current.imports.map((r) => r.id))

  return {
    data: {
      transactions: merged,
      imports: [
        ...current.imports,
        ...incoming.imports.filter((r) => !importIds.has(r.id)),
      ].sort((a, b) => b.importedAt.localeCompare(a.importedAt)),
      symbols: { ...incoming.symbols, ...current.symbols },
      savings: current.savings ?? incoming.savings,
      loans: [...current.loans, ...newLoans],
    },
    addedTransactions: added,
    knownTransactions: duplicates,
    addedLoans: newLoans.length,
  }
}

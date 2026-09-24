/** Which broker/custodian a transaction belongs to. */
export type AccountKind =
  | 'pea'
  | 'degiro'
  | 'ledger'
  | 'gold'
  | 'savings'
  | 'cash'

export interface AccountMeta {
  kind: AccountKind
  label: string
  shortLabel: string
  color: string
}

export const ACCOUNTS: AccountMeta[] = [
  { kind: 'pea', label: 'PEA (Boursorama)', shortLabel: 'PEA', color: '#10b981' },
  { kind: 'degiro', label: 'CTO (DEGIRO)', shortLabel: 'DEGIRO', color: '#3b82f6' },
  { kind: 'ledger', label: 'Crypto (Ledger)', shortLabel: 'Ledger', color: '#f59e0b' },
  { kind: 'gold', label: 'Or physique', shortLabel: 'Or', color: '#ca8a04' },
  { kind: 'savings', label: 'Livret A', shortLabel: 'Livret A', color: '#0ea5e9' },
  { kind: 'cash', label: 'Cash (billets)', shortLabel: 'Cash', color: '#64748b' },
]

/** Accounts that are savings rather than investments. */
export const SAVINGS_KINDS: AccountKind[] = ['savings', 'cash']

/** Manually tracked savings accounts. */
export const SAVINGS_SYMBOL = 'LIVRET-A'
export const CASH_SYMBOL = 'CASH'

export const TROY_OUNCE_GRAMS = 31.1034768

/**
 * Supported bullion coins. Fine gold content is what drives the melt value:
 * a Latin Monetary Union 20 francs weighs 6,45161 g at 900/1000, so 5,80645 g
 * of pure gold. Ids are persisted in saved entries: never rename one.
 */
export interface CoinSpec {
  id: string
  label: string
  fineGoldGrams: number
}

export const COIN_SPECS: CoinSpec[] = [
  {
    id: 'GOLD-20CHF',
    label: '20 francs Suisse (Helvetia / Vreneli)',
    fineGoldGrams: 5.80645,
  },
  {
    id: 'GOLD-20FRF',
    label: '20 francs Napoléon (Marianne / Coq)',
    fineGoldGrams: 5.80645,
  },
  {
    id: 'GOLD-KRUGERRAND',
    label: 'Krugerrand 1 once',
    fineGoldGrams: TROY_OUNCE_GRAMS,
  },
]

/**
 * One executed buy, normalised across sources. Amounts in EUR are the real
 * historical figures from the broker document; `price`/`grossLocal` stay in
 * the instrument's own currency.
 */
export interface Transaction {
  id: string
  account: AccountKind
  date: string // ISO: YYYY-MM-DD
  time: string
  isin: string
  /**
   * Market symbol when the source already knows it (crypto has no ISIN).
   * When absent, the symbol is resolved from the ISIN.
   */
  symbol?: string
  productName: string
  quantity: number
  price: number
  currency: string
  grossLocal: number
  amountEUR: number
  brokerFeesEUR: number
  fxFeesEUR: number
  feesEUR: number
  /**
   * Interest credited by the bank. Kept apart from `amountEUR` so it raises
   * the balance without ever landing in the cost basis.
   */
  interestEUR?: number
  orderRef: string
  source: string
}

export interface ImportRecord {
  id: string
  fileName: string
  kind: 'csv' | 'pdf'
  account: AccountKind
  importedAt: string
  linesInFile: number
  added: number
  duplicates: number
}

export interface Position {
  key: string
  isin: string
  ticker: string
  name: string
  account: AccountKind
  accounts: AccountKind[]
  currency: string
  quantity: number
  totalCostEUR: number
  avgCostEUR: number
  avgCostLocal: number
  currentPriceLocal: number
  currentPriceEUR: number
  currentValueEUR: number
  pnlEUR: number
  pnlPercent: number
  weight: number
  firstBuyDate: string
  cagrPercent: number | null
  feesEUR: number
  brokerFeesEUR: number
  fxFeesEUR: number
  orderCount: number
  priced: boolean
}

export interface PortfolioSummary {
  totalValueEUR: number
  totalCostEUR: number
  totalFeesEUR: number
  brokerFeesEUR: number
  fxFeesEUR: number
  feesPercentOfInvested: number
  orderCount: number
  totalPnlEUR: number
  totalPnlPercent: number
  cagrPercent: number | null
  firstDate: string
}

export interface StockQuote {
  symbol: string
  price: number
  currency: string
  change: number
  changePercent: number
  marketCap: number
  name: string
}

/**
 * A fixed-rate loan. Liabilities have no market price and no position: they
 * follow a repayment schedule, so they live beside `Transaction`, not in it.
 */
export type LoanKind = 'student' | 'consumer' | 'car' | 'other'
export type LoanRepayment = 'amortizing' | 'bullet'
export type LoanDeferral = 'none' | 'partial' | 'total'

export interface Loan {
  id: string
  name: string
  kind: LoanKind
  lender: string
  principalEUR: number
  annualRatePercent: number
  /** Number of monthly due dates, deferral included. */
  durationMonths: number
  /** Day the funds arrived; due dates follow monthly from there. */
  startDate: string
  repayment: LoanRepayment
  deferral: LoanDeferral
  deferralMonths: number
  insuranceMonthlyEUR: number
  feesEUR: number
  /** Monthly payment stated by the lender, insurance excluded, to check the input. */
  bankPaymentEUR: number | null
}

export const LOAN_KINDS: { kind: LoanKind; label: string }[] = [
  { kind: 'student', label: 'Prêt étudiant' },
  { kind: 'consumer', label: 'Crédit à la consommation' },
  { kind: 'car', label: 'Crédit auto' },
  { kind: 'other', label: 'Autre prêt' },
]

export interface HistoricalPrice {
  date: string
  close: number
  adjClose: number
}

/** ISIN → Yahoo symbol, resolved once then cached. */
export interface SymbolInfo {
  isin: string
  symbol: string
  currency: string
  name: string
}

export interface ParseResult {
  transactions: Transaction[]
  warnings: string[]
}

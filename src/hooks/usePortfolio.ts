import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type {
  Loan,
  Transaction,
  Position,
  PortfolioSummary,
  StockQuote,
  HistoricalPrice,
  ImportRecord,
  SymbolInfo,
  AccountKind,
} from '../types'
import { SAVINGS_KINDS } from '../types'
import { parseDegiroCsv } from '../parsers/degiroCsv'
import { parseBoursoramaPdf } from '../parsers/boursoramaPdf'
import { parseLedgerCsv, isLedgerCsv } from '../parsers/ledgerCsv'
import {
  parseBoursoramaAccountCsv,
  isBoursoramaAccountCsv,
} from '../parsers/boursoramaAccountCsv'
import {
  GOLD_SPOT_SYMBOL,
  goldQuotes,
  goldHistory,
  buildGoldTransaction,
  coinValueEUR,
  type GoldEntry,
} from '../parsers/goldManual'
import {
  buildSavingsDeposit,
  migrateOrphanBalance,
  savingsBalance,
  savingsQuote,
  buildCashMovement,
  cashQuote,
  type SavingsBalance,
} from '../parsers/savingsManual'
import { mergeTransactions, sortTransactionsDesc } from '../parsers/shared'
import {
  buildPositions,
  buildSummary,
  filterByAccount,
  currenciesUsed,
  isinsUsed,
  type FxRates,
} from '../utils/calculations'
import {
  resolveIsins,
  fetchQuotes,
  fetchHistory,
  fetchFxRates,
  fetchLivretARate,
} from '../api/stockApi'
import {
  loadTransactions,
  saveTransactions,
  loadImports,
  saveImports,
  loadSymbols,
  saveSymbols,
  clearAllData,
  clearLegacyData,
  loadSavings,
  saveSavings,
  clearSavings,
  loadLoans,
  saveLoans,
} from '../utils/store'

export interface ImportOutcome {
  ok: boolean
  message: string
  warnings: string[]
  added?: number
  duplicates?: number
}

export type Scope = AccountKind | 'all'

/**
 * What this browser already holds, read once at start. A Livret A balance
 * typed before any movement becomes its opening movement (see
 * `migrateOrphanBalance`); the mount effect then persists that migration.
 */
function readStoredPortfolio() {
  const stored = loadTransactions() ?? []
  const savings = loadSavings()
  const migrated = migrateOrphanBalance(stored, savings)
  return migrated
    ? { transactions: sortTransactionsDesc(migrated), savings: null, migrated: true }
    : { transactions: stored, savings, migrated: false }
}

/**
 * `public/Transactions.csv`, a local DEGIRO export used as starting data
 * when nothing is stored yet. Empty when the file does not exist.
 */
async function readBundledCsv(): Promise<Transaction[]> {
  try {
    const res = await fetch('/Transactions.csv')
    // Without the file, Vite's SPA fallback answers 200 with index.html.
    if (!res.ok || res.headers.get('content-type')?.includes('text/html')) return []
    const { transactions } = parseDegiroCsv(await res.text(), 'Transactions.csv')
    return sortTransactionsDesc(transactions)
  } catch {
    return []
  }
}

export function usePortfolio(scope: Scope) {
  const [boot] = useState(readStoredPortfolio)
  const [allTransactions, setAllTransactions] = useState<Transaction[]>(boot.transactions)
  const [imports, setImports] = useState<ImportRecord[]>(loadImports)
  const [symbols, setSymbols] = useState<Record<string, SymbolInfo>>(loadSymbols)
  const [quotes, setQuotes] = useState<StockQuote[]>([])
  const [history, setHistory] = useState<Record<string, HistoricalPrice[]>>({})
  const [spHistory, setSpHistory] = useState<HistoricalPrice[]>([])
  const [ndxHistory, setNdxHistory] = useState<HistoricalPrice[]>([])
  const [fxHistory, setFxHistory] = useState<Record<string, HistoricalPrice[]>>({})
  const [rates, setRates] = useState<FxRates>({ EUR: 1 })
  const [goldSpotUSD, setGoldSpotUSD] = useState(0)
  const [savings, setSavings] = useState<SavingsBalance | null>(boot.savings)
  const [loans, setLoans] = useState<Loan[]>(loadLoans)
  const [savingsRate, setSavingsRate] = useState<{
    rate: number
    since: string
  } | null>(null)
  // Without stored data, the bundled CSV (if any) is fetched before anything
  // can be priced.
  const [ready, setReady] = useState(boot.transactions.length > 0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Every change of the transactions reloads the market data; a slower,
  // older load must not land on top of the newer one.
  const loadId = useRef(0)

  const seedFromBundledCsv = useCallback(() => {
    readBundledCsv().then((seeded) => {
      if (seeded.length) saveTransactions(seeded)
      setAllTransactions(seeded)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    clearLegacyData()
    if (boot.migrated && saveTransactions(boot.transactions)) clearSavings()

    // Published by the Caisse des Dépôts; missing rate is not fatal.
    fetchLivretARate()
      .then(setSavingsRate)
      .catch(() => setSavingsRate(null))

    if (!boot.transactions.length) seedFromBundledCsv()
  }, [boot, seedFromBundledCsv])

  /** Resolves any ISIN we have not seen before, then caches it. */
  const ensureSymbols = useCallback(
    async (txs: Transaction[]): Promise<Record<string, SymbolInfo>> => {
      const known = loadSymbols()
      const needResolving = new Set(
        txs.filter((t) => !t.symbol).map((t) => t.isin)
      )
      const missing = isinsUsed(txs).filter(
        (isin) => needResolving.has(isin) && !known[isin]
      )
      if (!missing.length) return known

      // Product names let the server retry by name when an ISIN is unindexed.
      const names: Record<string, string> = {}
      for (const tx of txs) {
        if (missing.includes(tx.isin)) names[tx.isin] = tx.productName
      }

      const resolved = await resolveIsins(missing, names)
      const next = { ...known }
      for (const info of resolved) next[info.isin] = info

      saveSymbols(next)
      setSymbols(next)
      return next
    },
    []
  )

  const loadMarketData = useCallback(
    async (txs: Transaction[]) => {
      const id = ++loadId.current
      const current = () => id === loadId.current
      if (!txs.length) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const symbolMap = await ensureSymbols(txs)

        // Coins have no listing of their own: their value is derived from the
        // gold spot price, so they are priced separately from market tickers.
        const coinIds = [
          ...new Set(
            txs.filter((t) => t.account === 'gold').map((t) => t.symbol!)
          ),
        ]
        const tickers = [
          ...new Set(
            txs
              .filter(
                (t) => t.account !== 'gold' && !SAVINGS_KINDS.includes(t.account)
              )
              .map((t) => t.symbol ?? symbolMap[t.isin]?.symbol)
              .filter(Boolean)
          ),
        ] as string[]

        // Gold spot is always fetched: the Or tab shows the current price of a
        // coin before any purchase has been recorded. It is quoted in USD.
        const currencies = [
          ...new Set([
            ...currenciesUsed(txs),
            'USD',
            ...tickers.map((t) =>
              Object.values(symbolMap).find((s) => s.symbol === t)?.currency
            ),
          ]),
        ].filter(Boolean) as string[]

        const marketSymbols = [...tickers, GOLD_SPOT_SYMBOL]

        const [quotesData, fxData] = await Promise.all([
          fetchQuotes(marketSymbols),
          fetchFxRates(currencies),
        ])
        if (!current()) return

        const spotUSD =
          quotesData.find((q) => q.symbol === GOLD_SPOT_SYMBOL)?.price ?? 0
        const usdRate = fxData.USD ?? 1
        setGoldSpotUSD(spotUSD)

        setQuotes([
          ...quotesData.filter((q) => q.symbol !== GOLD_SPOT_SYMBOL),
          ...goldQuotes(coinIds, spotUSD, usdRate),
        ])
        setRates(fxData)

        const from = txs.map((t) => t.date).sort()[0]

        const foreign = currencies.filter((c) => c !== 'EUR')
        const results = await Promise.allSettled([
          ...tickers.map((t) => fetchHistory(t, from)),
          fetchHistory('^GSPC', from),
          fetchHistory('^NDX', from),
          ...foreign.map((c) => fetchHistory(`EUR${c}=X`, from)),
          ...(coinIds.length ? [fetchHistory(GOLD_SPOT_SYMBOL, from)] : []),
        ])
        if (!current()) return

        const histMap: Record<string, HistoricalPrice[]> = {}
        tickers.forEach((ticker, i) => {
          const r = results[i]
          if (r.status === 'fulfilled') histMap[ticker] = r.value
        })

        const sp = results[tickers.length]
        if (sp?.status === 'fulfilled') setSpHistory(sp.value)

        const ndx = results[tickers.length + 1]
        if (ndx?.status === 'fulfilled') setNdxHistory(ndx.value)

        const fxHist: Record<string, HistoricalPrice[]> = {}
        foreign.forEach((currency, i) => {
          const r = results[tickers.length + 2 + i]
          if (r?.status === 'fulfilled') fxHist[currency] = r.value
        })
        setFxHistory(fxHist)

        if (coinIds.length) {
          const spot = results[tickers.length + 2 + foreign.length]
          if (spot?.status === 'fulfilled') {
            for (const coinId of coinIds) {
              histMap[coinId] = goldHistory(
                coinId,
                spot.value,
                fxHist.USD ?? [],
                usdRate
              )
            }
          }
        }
        setHistory(histMap)
      } catch (err) {
        if (current()) setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        if (current()) setLoading(false)
      }
    },
    [ensureSymbols]
  )

  useEffect(() => {
    // Fetching is this effect's job: the loading flag flips with it.
    // oxlint-disable-next-line react/set-state-in-effect
    if (ready) loadMarketData(allTransactions)
  }, [ready, allTransactions, loadMarketData])

  // The scoped view feeds the Investissements page only, where a savings
  // account has no place — Patrimoine reads `allTransactions` instead.
  const transactions = useMemo(
    () =>
      filterByAccount(allTransactions, scope).filter(
        (t) => !SAVINGS_KINDS.includes(t.account)
      ),
    [allTransactions, scope]
  )

  // The savings balance is typed in rather than fetched, so its quote is built
  // here and refreshes as soon as the balance changes.
  const effectiveQuotes = useMemo(() => {
    const deposits = allTransactions.filter((t) => t.account === 'savings')
    if (!deposits.length) return quotes
    const { balanceEUR } = savingsBalance(deposits, savings)
    const units = deposits.filter((t) => t.quantity > 0).length
    return [...quotes, savingsQuote(balanceEUR, units)]
  }, [quotes, allTransactions, savings])

  const withCash = useMemo(() => {
    const moves = allTransactions.filter((t) => t.account === 'cash')
    if (!moves.length) return effectiveQuotes
    const held = moves.reduce((s, t) => s + t.amountEUR, 0)
    return [...effectiveQuotes, cashQuote(held, moves.length)]
  }, [effectiveQuotes, allTransactions])

  const positions: Position[] = useMemo(
    () => buildPositions(transactions, symbols, withCash, rates),
    [transactions, symbols, withCash, rates]
  )

  // Patrimoine counts everything, savings included — unlike the scoped set
  // above, which feeds the Investissements page.
  const allPositions: Position[] = useMemo(
    () => buildPositions(allTransactions, symbols, withCash, rates),
    [allTransactions, symbols, withCash, rates]
  )

  const summary: PortfolioSummary | null = useMemo(
    () => (positions.length ? buildSummary(positions, transactions) : null),
    [positions, transactions]
  )

  const accountsPresent = useMemo(
    () => [...new Set(allTransactions.map((t) => t.account))],
    [allTransactions]
  )

  const unresolvedIsins = useMemo(
    () =>
      [...new Set(allTransactions.map((t) => t.isin))].filter(
        (isin) => isin && !symbols[isin]
      ),
    [allTransactions, symbols]
  )

  const importFiles = useCallback(
    async (files: File[]): Promise<ImportOutcome> => {
      const incoming: Transaction[] = []
      const warnings: string[] = []
      const records: ImportRecord[] = []
      let linesRead = 0

      for (const file of files) {
        const isPdf =
          file.type === 'application/pdf' ||
          file.name.toLowerCase().endsWith('.pdf')

        let result
        if (isPdf) {
          result = await parseBoursoramaPdf(file)
        } else {
          const text = await file.text()
          if (isLedgerCsv(text)) {
            result = await parseLedgerCsv(text, file.name)
          } else if (isBoursoramaAccountCsv(text)) {
            result = parseBoursoramaAccountCsv(text, file.name)
            // Imported statements are authoritative; drop any manual balance.
            if (result.transactions.length) {
              clearSavings()
              setSavings(null)
            }
          } else {
            result = parseDegiroCsv(text, file.name)
          }
        }

        warnings.push(...result.warnings)
        incoming.push(...result.transactions)
        linesRead += result.transactions.length

        records.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fileName: file.name,
          kind: isPdf ? 'pdf' : 'csv',
          account: result.transactions[0]?.account ?? 'degiro',
          importedAt: new Date().toISOString(),
          linesInFile: result.transactions.length,
          added: 0,
          duplicates: 0,
        })
      }

      if (!incoming.length) {
        return {
          ok: false,
          warnings,
          message:
            warnings[0] ??
            "Aucune transaction lisible dans le ou les fichiers fournis.",
        }
      }

      const { merged, added, duplicates } = mergeTransactions(
        allTransactions,
        incoming
      )

      if (!saveTransactions(merged)) {
        return {
          ok: false,
          warnings,
          message:
            "Impossible d'enregistrer les données (stockage du navigateur indisponible).",
        }
      }

      // Attribute the added/duplicate split across the files of this batch.
      let remaining = added
      for (const rec of records) {
        const take = Math.min(rec.linesInFile, remaining)
        rec.added = take
        rec.duplicates = rec.linesInFile - take
        remaining -= take
      }

      const nextImports = [...records.reverse(), ...imports]
      saveImports(nextImports)
      setImports(nextImports)
      setAllTransactions(merged)

      const s = (n: number) => (n > 1 ? 's' : '')
      return {
        ok: true,
        added,
        duplicates,
        warnings,
        message: added
          ? `${added} transaction${s(added)} ajoutée${s(added)} sur ${linesRead} lue${s(linesRead)}, ${duplicates} déjà connue${s(duplicates)}.`
          : `Aucune nouveauté : les ${duplicates} transaction${s(duplicates)} lue${s(duplicates)} étaient déjà enregistrées.`,
      }
    },
    [allTransactions, imports]
  )

  /** Current melt value of one coin, used as the default purchase price. */
  const meltValueEUR = useCallback(
    (coinId: string) =>
      coinValueEUR(coinId, goldSpotUSD, rates.USD ?? 1),
    [goldSpotUSD, rates]
  )

  const addGoldEntry = useCallback(
    async (entry: GoldEntry): Promise<ImportOutcome> => {
      // Price the purchase at the gold price of that day, unless a real
      // amount paid was given — coins usually carry a dealer premium.
      let meltThatDay = 0
      try {
        const [spot, fx] = await Promise.all([
          fetchHistory(GOLD_SPOT_SYMBOL, entry.date),
          fetchHistory('EURUSD=X', entry.date),
        ])
        const ounce = spot[0]?.close ?? 0
        const rate = fx[0]?.close ?? rates.USD ?? 1
        meltThatDay = coinValueEUR(entry.coinId, ounce, rate)
      } catch {
        meltThatDay = 0
      }

      const tx = buildGoldTransaction(entry, meltThatDay)
      const { merged, added, duplicates } = mergeTransactions(allTransactions, [
        tx,
      ])

      if (!saveTransactions(merged)) {
        return {
          ok: false,
          warnings: [],
          message:
            "Impossible d'enregistrer les données (stockage du navigateur indisponible).",
        }
      }

      setAllTransactions(merged)

      return {
        ok: added > 0,
        added,
        duplicates,
        warnings:
          !entry.totalPaidEUR && !meltThatDay
            ? [
                "Cours de l'or indisponible à cette date : saisis le montant payé pour obtenir une performance juste.",
              ]
            : [],
        message: added
          ? `${entry.quantity} pièce(s) ajoutée(s).`
          : 'Cet achat est déjà enregistré (même date, même quantité).',
      }
    },
    [allTransactions, rates]
  )

  const addSavingsDeposit = useCallback(
    (
      date: string,
      amountEUR: number,
      kind: 'deposit' | 'opening' = 'deposit'
    ): ImportOutcome => {
      const tx = buildSavingsDeposit(date, amountEUR, kind)
      const { merged, added } = mergeTransactions(allTransactions, [tx])

      if (!saveTransactions(merged)) {
        return {
          ok: false,
          warnings: [],
          message:
            "Impossible d'enregistrer les données (stockage du navigateur indisponible).",
        }
      }
      setAllTransactions(merged)
      // The opening movement now carries the balance: a typed one would
      // otherwise be read as interest on top of it.
      if (added && kind === 'opening') {
        clearSavings()
        setSavings(null)
      }

      return {
        ok: added > 0,
        added,
        warnings: [],
        message: added
          ? kind === 'opening'
            ? 'Solde de départ enregistré.'
            : 'Versement enregistré.'
          : 'Ce mouvement est déjà enregistré (même date, même montant).',
      }
    },
    [allTransactions]
  )

  const addCashMovement = useCallback(
    (date: string, amountEUR: number): ImportOutcome => {
      const tx = buildCashMovement(date, amountEUR)
      const { merged, added } = mergeTransactions(allTransactions, [tx])

      if (!saveTransactions(merged)) {
        return {
          ok: false,
          warnings: [],
          message:
            "Impossible d'enregistrer les données (stockage du navigateur indisponible).",
        }
      }
      setAllTransactions(merged)

      return {
        ok: added > 0,
        added,
        warnings: [],
        message: added
          ? 'Mouvement enregistré.'
          : 'Ce mouvement est déjà enregistré (même date, même montant).',
      }
    },
    [allTransactions]
  )

  const setSavingsBalance = useCallback((balanceEUR: number) => {
    const next = { balanceEUR, updatedAt: new Date().toISOString() }
    if (saveSavings(next)) setSavings(next)
  }, [])

  /** Adds the loan, or replaces the one with the same id. */
  const saveLoan = useCallback(
    (loan: Loan): boolean => {
      const next = loans.some((l) => l.id === loan.id)
        ? loans.map((l) => (l.id === loan.id ? loan : l))
        : [...loans, loan]
      if (!saveLoans(next)) return false
      setLoans(next)
      return true
    },
    [loans]
  )

  const removeLoan = useCallback(
    (id: string) => {
      const next = loans.filter((l) => l.id !== id)
      if (saveLoans(next)) setLoans(next)
    },
    [loans]
  )

  const removeTransaction = useCallback(
    (id: string) => {
      // Split fills of one order share an id on purpose (that is how the
      // dedup counts them), so only the first match is dropped here.
      const index = allTransactions.findIndex((t) => t.id === id)
      if (index < 0) return
      const merged = allTransactions.filter((_, i) => i !== index)
      if (saveTransactions(merged)) setAllTransactions(merged)
    },
    [allTransactions]
  )

  /** Deletes exact rows, addressed by their position in `allTransactions`. */
  const removeTransactionsAt = useCallback(
    (indices: number[]) => {
      const drop = new Set(indices)
      if (!drop.size) return
      const merged = allTransactions.filter((_, i) => !drop.has(i))
      if (saveTransactions(merged)) setAllTransactions(merged)
    },
    [allTransactions]
  )

  const resetData = useCallback(() => {
    clearAllData()
    setImports([])
    setSymbols({})
    setSavings(null)
    setLoans([])
    setAllTransactions([])
    setReady(false)
    seedFromBundledCsv()
  }, [seedFromBundledCsv])

  return {
    allTransactions,
    transactions,
    positions,
    allPositions,
    summary,
    quotes,
    history,
    spHistory,
    ndxHistory,
    fxHistory,
    rates,
    symbols,
    imports,
    accountsPresent,
    unresolvedIsins,
    loading,
    error,
    reload: () => loadMarketData(allTransactions),
    importFiles,
    addGoldEntry,
    addSavingsDeposit,
    addCashMovement,
    setSavingsBalance,
    savings,
    savingsRate,
    loans,
    saveLoan,
    removeLoan,
    removeTransaction,
    removeTransactionsAt,
    meltValueEUR,
    goldSpotUSD,
    resetData,
  }
}

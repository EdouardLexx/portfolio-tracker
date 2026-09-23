import { useMemo, useRef, useState } from 'react'
import type { Transaction, ImportRecord, Position, SymbolInfo } from '../types'
import { ACCOUNTS } from '../types'
import type { ImportOutcome } from '../hooks/usePortfolio'
import {
  formatEUR,
  formatMoney,
  formatQuantity,
  readableTextOn,
} from '../utils/formatters'

interface DataPageProps {
  transactions: Transaction[]
  positions: Position[]
  imports: ImportRecord[]
  symbols: Record<string, SymbolInfo>
  unresolvedIsins: string[]
  importFiles: (files: File[]) => Promise<ImportOutcome>
  removeTransactionsAt: (indices: number[]) => void
  resetData: () => void
}

function Card({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-4 gap-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  )
}

function AccountBadge({ kind }: { kind: string }) {
  const meta = ACCOUNTS.find((m) => m.kind === kind)
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full text-white dark:text-gray-900 whitespace-nowrap"
      style={{ backgroundColor: meta?.color ?? '#9ca3af' }}
    >
      {meta?.shortLabel ?? kind}
    </span>
  )
}

export function DataPage({
  transactions,
  positions,
  imports,
  symbols,
  unresolvedIsins,
  importFiles,
  removeTransactionsAt,
  resetData,
}: DataPageProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  async function handleFiles(list: FileList | null) {
    const files = list ? [...list] : []
    if (!files.length) return

    setBusy(true)
    setOutcome(null)
    try {
      setOutcome(await importFiles(files))
    } catch (err) {
      setOutcome({
        ok: false,
        warnings: [],
        message:
          err instanceof Error ? err.message : 'Lecture des fichiers impossible.',
      })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const dates = transactions.map((tx) => tx.date).sort()
  const orders = new Set(transactions.map((tx) => tx.orderRef)).size
  const invested = transactions.reduce((s, tx) => s + tx.amountEUR, 0)

  return (
    <div className="space-y-6">
      <Card title="Importer des relevés">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Dépose un export de transactions <strong>DEGIRO</strong> (.csv) ou un ou
          plusieurs <strong>avis d'opéré Boursorama</strong> (.pdf) — le compte est
          reconnu automatiquement. Les lignes déjà enregistrées sont ignorées, donc
          ré-importer un fichier ne crée jamais de doublon.
        </p>

        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            handleFiles(e.dataTransfer.files)
          }}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-10 px-4 cursor-pointer transition-colors ${
            dragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.pdf,text/csv,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <span className="text-3xl">📄</span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {busy
              ? 'Import en cours…'
              : 'Choisir des fichiers ou les déposer ici'}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            CSV DEGIRO · PDF Boursorama · plusieurs fichiers à la fois
          </span>
        </label>

        {outcome && (
          <div
            className={`mt-4 rounded-lg px-4 py-3 text-sm ${
              outcome.ok
                ? outcome.added
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                : 'bg-red-50 text-red-700'
            }`}
          >
            <p>{outcome.message}</p>
            {outcome.warnings.length > 0 && (
              <ul className="mt-2 space-y-1 text-amber-700 dark:text-amber-400">
                {outcome.warnings.map((w) => (
                  <li key={w}>· {w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {unresolvedIsins.length > 0 && (
        <Card title="Titres non cotés">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Aucun symbole boursier n'a pu être trouvé pour ces ISIN, donc ces
            lignes sont exclues de la valorisation.
          </p>
          <div className="flex flex-wrap gap-2">
            {unresolvedIsins.map((isin) => (
              <span
                key={isin}
                className="text-xs bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-full px-3 py-1"
              >
                {isin}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card
        title="Données enregistrées"
        aside={
          <span className="text-sm text-gray-500 dark:text-gray-400">
            conservées dans ce navigateur
          </span>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          {[
            ['Lignes', String(transactions.length)],
            ['Ordres', String(orders)],
            ['Titres', String(positions.length)],
            ['Investi', formatEUR(invested)],
          ].map(([label, value]) => (
            <div key={label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
            </div>
          ))}
        </div>

        {dates.length > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            Historique du {dates[0]} au {dates[dates.length - 1]}.
          </p>
        )}

        <div className="border-t border-gray-100 dark:border-gray-800 pt-4 flex flex-wrap items-center gap-3">
          {confirmReset ? (
            <>
              <span className="text-sm text-red-700 dark:text-red-300">
                Effacer tout l'historique importé et repartir du fichier initial ?
              </span>
              <button
                onClick={() => {
                  resetData()
                  setConfirmReset(false)
                  setOutcome(null)
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white dark:text-gray-900 hover:bg-red-700"
              >
                Oui, tout effacer
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Annuler
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="px-3 py-1.5 text-sm rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
            >
              Réinitialiser les données
            </button>
          )}
        </div>
      </Card>

      {imports.length > 0 && (
        <Card title="Historique des imports">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400 text-left border-b border-gray-100 dark:border-gray-800">
                  <th className="pb-2 font-medium">Fichier</th>
                  <th className="pb-2 font-medium">Compte</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium text-right">Lues</th>
                  <th className="pb-2 font-medium text-right">Ajoutées</th>
                  <th className="pb-2 font-medium text-right">Doublons</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((rec) => (
                  <tr
                    key={rec.id}
                    className="border-b border-gray-50 dark:border-gray-800 last:border-0"
                  >
                    <td className="py-2 font-medium text-gray-900 dark:text-gray-100 max-w-[260px] truncate">
                      {rec.fileName}
                    </td>
                    <td className="py-2">
                      <AccountBadge kind={rec.account} />
                    </td>
                    <td className="py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {new Date(rec.importedAt).toLocaleString('fr-FR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-2 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                      {rec.linesInFile}
                    </td>
                    <td
                      className={`py-2 text-right font-medium tabular-nums ${
                        rec.added ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {rec.added ? `+${rec.added}` : '0'}
                    </td>
                    <td className="py-2 text-right text-gray-400 dark:text-gray-500 tabular-nums">
                      {rec.duplicates}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <TransactionBrowser
        transactions={transactions}
        symbols={symbols}
        removeTransactionsAt={removeTransactionsAt}
      />
    </div>
  )
}

interface TransactionBrowserProps {
  transactions: Transaction[]
  symbols: Record<string, SymbolInfo>
  removeTransactionsAt: (indices: number[]) => void
}

/**
 * Every stored line, grouped by account and deletable. Rows carry their index
 * in the stored array rather than their id: split fills of one order share an
 * id, and deleting by id would take all of them at once.
 */
function TransactionBrowser({
  transactions,
  symbols,
  removeTransactionsAt,
}: TransactionBrowserProps) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState(false)

  const labelOf = (tx: Transaction) =>
    tx.symbol || symbols[tx.isin]?.symbol || tx.isin || tx.productName

  const rows = useMemo(
    () => transactions.map((tx, index) => ({ tx, index })),
    [transactions]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(({ tx }) =>
      [labelOf(tx), tx.productName, tx.date, tx.account, tx.source]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
    // labelOf depends on symbols, which changes with the data
  }, [rows, query, symbols])

  const groups = useMemo(() => {
    const byAccount = new Map<string, typeof filtered>()
    for (const row of filtered) {
      const list = byAccount.get(row.tx.account) ?? []
      list.push(row)
      byAccount.set(row.tx.account, list)
    }
    return ACCOUNTS.filter((a) => byAccount.has(a.kind)).map((a) => ({
      meta: a,
      rows: byAccount.get(a.kind)!,
    }))
  }, [filtered])

  const toggle = (index: number) => {
    const next = new Set(selected)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setSelected(next)
    setConfirming(false)
  }

  const toggleGroup = (indices: number[]) => {
    const next = new Set(selected)
    const allOn = indices.every((i) => next.has(i))
    for (const i of indices) {
      if (allOn) next.delete(i)
      else next.add(i)
    }
    setSelected(next)
    setConfirming(false)
  }

  return (
    <Card
      title="Transactions"
      aside={
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {filtered.length === transactions.length
            ? `${transactions.length} lignes`
            : `${filtered.length} sur ${transactions.length} lignes`}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer (ISIN, PEA, 2025-01…)"
          className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900"
        />
        {selected.size > 0 &&
          (confirming ? (
            <>
              <span className="text-sm text-red-700 dark:text-red-300">
                Supprimer {selected.size} ligne{selected.size > 1 ? 's' : ''} ?
              </span>
              <button
                onClick={() => {
                  removeTransactionsAt([...selected])
                  setSelected(new Set())
                  setConfirming(false)
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Confirmer
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                Annuler
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="px-3 py-1.5 text-sm rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
            >
              Supprimer la sélection ({selected.size})
            </button>
          ))}
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Aucune ligne ne correspond.
        </p>
      )}

      <div className="space-y-5">
        {groups.map(({ meta, rows: groupRows }) => {
          const indices = groupRows.map((r) => r.index)
          const total = groupRows.reduce((s, r) => s + r.tx.amountEUR, 0)
          const isCollapsed = collapsed[meta.kind]

          return (
            <div key={meta.kind}>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <button
                  onClick={() =>
                    setCollapsed({ ...collapsed, [meta.kind]: !isCollapsed })
                  }
                  className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200"
                >
                  <span className="text-gray-400 dark:text-gray-500 w-3">
                    {isCollapsed ? '▸' : '▾'}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: meta.color,
                      color: readableTextOn(meta.color),
                    }}
                  >
                    {meta.shortLabel}
                  </span>
                  {meta.label}
                </button>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {groupRows.length} ligne{groupRows.length > 1 ? 's' : ''} ·{' '}
                  {formatEUR(total)}
                </span>
                <button
                  onClick={() => toggleGroup(indices)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-auto"
                >
                  {indices.every((i) => selected.has(i))
                    ? 'Tout désélectionner'
                    : 'Tout sélectionner'}
                </button>
              </div>

              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 dark:text-gray-400 text-left border-b border-gray-100 dark:border-gray-800">
                        <th className="pb-2 w-8"></th>
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium">Produit</th>
                        <th className="pb-2 font-medium text-right">Qté</th>
                        <th className="pb-2 font-medium text-right">Cours</th>
                        <th className="pb-2 font-medium text-right">Montant</th>
                        <th className="pb-2 font-medium">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map(({ tx, index }) => (
                        <tr
                          key={index}
                          className={`border-b border-gray-50 dark:border-gray-800 last:border-0 ${
                            selected.has(index)
                              ? 'bg-red-50/60 dark:bg-red-950/40'
                              : ''
                          }`}
                        >
                          <td className="py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(index)}
                              onChange={() => toggle(index)}
                              className="accent-red-600"
                              aria-label={`Sélectionner ${labelOf(tx)} du ${tx.date}`}
                            />
                          </td>
                          <td className="py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {tx.date}
                          </td>
                          <td className="py-2">
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {labelOf(tx)}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                              {tx.productName}
                            </span>
                          </td>
                          <td className="py-2 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                            {formatQuantity(tx.quantity)}
                          </td>
                          <td className="py-2 text-right text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">
                            {formatMoney(tx.price, tx.currency)}
                          </td>
                          <td className="py-2 text-right text-gray-900 dark:text-gray-100 tabular-nums whitespace-nowrap">
                            {formatEUR(tx.interestEUR ?? tx.amountEUR)}
                          </td>
                          <td className="py-2 text-xs text-gray-400 dark:text-gray-500 max-w-[200px] truncate">
                            {tx.source}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

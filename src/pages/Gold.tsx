import { useState } from 'react'
import type { Transaction, Position } from '../types'
import { COIN_SPECS, TROY_OUNCE_GRAMS } from '../types'
import type { ImportOutcome } from '../hooks/usePortfolio'
import {
  formatEUR,
  formatHolding,
  formatNumber,
  formatQuantity,
} from '../utils/formatters'

interface GoldPageProps {
  transactions: Transaction[]
  positions: Position[]
  goldSpotUSD: number
  usdRate: number
  meltValueEUR: (coinId: string) => number
  addGoldEntry: (entry: {
    coinId: string
    date: string
    quantity: number
    totalPaidEUR?: number
  }) => Promise<ImportOutcome>
  removeTransaction: (id: string) => void
}

export function GoldPage({
  transactions,
  positions,
  goldSpotUSD,
  usdRate,
  meltValueEUR,
  addGoldEntry,
  removeTransaction,
}: GoldPageProps) {
  const [coinId, setCoinId] = useState(COIN_SPECS[0].id)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [quantity, setQuantity] = useState('1')
  const [paid, setPaid] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const goldLines = transactions.filter((t) => t.account === 'gold')
  const goldPositions = positions.filter((p) =>
    p.accounts.includes('gold')
  )

  const spec = COIN_SPECS.find((c) => c.id === coinId) ?? COIN_SPECS[0]
  const melt = meltValueEUR(coinId)
  const ouncePriceEUR = usdRate ? goldSpotUSD / usdRate : 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const qty = parseFloat(quantity.replace(',', '.'))
    if (!Number.isFinite(qty) || qty <= 0) {
      setOutcome({
        ok: false,
        warnings: [],
        message: 'Indique une quantité de pièces supérieure à zéro.',
      })
      return
    }

    setBusy(true)
    setOutcome(null)
    try {
      const totalPaidEUR = paid
        ? parseFloat(paid.replace(',', '.')) || undefined
        : undefined
      setOutcome(await addGoldEntry({ coinId, date, quantity: qty, totalPaidEUR }))
      setQuantity('1')
      setPaid('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <div className="flex items-baseline justify-between mb-4 gap-4">
          <h3 className="text-lg font-semibold">Cours de l'or</h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">COMEX, temps différé</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Once troy</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {formatEUR(ouncePriceEUR)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formatNumber(goldSpotUSD)} $US
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Gramme d'or fin</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {formatEUR(ouncePriceEUR / TROY_OUNCE_GRAMS)}
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950 rounded-lg p-4">
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-1">
              Valeur or d'une pièce
            </p>
            <p className="text-xl font-bold text-amber-900 dark:text-amber-200">
              {formatEUR(melt)}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              {formatNumber(spec.fineGoldGrams, 3)} g d'or fin
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Les pièces sont valorisées au poids d'or qu'elles contiennent. En
          boutique elles se négocient au-dessus, avec une prime de collection
          qui n'est pas suivie ici.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Ajouter un achat</h3>

        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <label className="sm:col-span-2 block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Pièce</span>
            <select
              value={coinId}
              onChange={(e) => setCoinId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              {COIN_SPECS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
              Date d'achat
            </span>
            <input
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
              Nombre de pièces
            </span>
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
              Payé au total (€)
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              placeholder="facultatif"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </label>

          <div className="sm:col-span-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white dark:text-gray-900 hover:bg-amber-700 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {busy ? 'Ajout…' : 'Ajouter'}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Sans montant payé, l'achat est valorisé au cours de l'or de cette
              date-là.
            </span>
          </div>
        </form>

        {outcome && (
          <div
            className={`mt-4 rounded-lg px-4 py-3 text-sm ${
              outcome.ok
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
            }`}
          >
            <p>{outcome.message}</p>
            {outcome.warnings.map((w) => (
              <p key={w} className="mt-1 text-amber-700 dark:text-amber-400">
                {w}
              </p>
            ))}
          </div>
        )}
      </div>

      {goldPositions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {goldPositions.map((p) => (
            <div
              key={p.key}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm"
            >
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{p.name}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatEUR(p.currentValueEUR)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {formatQuantity(p.quantity)} pièces ·{' '}
                {formatHolding(
                  p.quantity *
                    (COIN_SPECS.find((c) => c.id === p.key)?.fineGoldGrams ?? 0),
                  1
                )}{' '}
                g d'or fin
              </p>
              <p
                className={`text-sm font-medium mt-2 ${
                  p.pnlEUR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                }`}
              >
                {p.pnlEUR >= 0 ? '+' : ''}
                {formatEUR(p.pnlEUR)} ({p.pnlEUR >= 0 ? '+' : ''}
                {formatNumber(p.pnlPercent)}%)
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <div className="flex items-baseline justify-between mb-4 gap-4">
          <h3 className="text-lg font-semibold">Achats enregistrés</h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {goldLines.length} ligne{goldLines.length > 1 ? 's' : ''}
          </span>
        </div>

        {goldLines.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Aucun achat pour l'instant. Utilise le formulaire ci-dessus.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400 text-left border-b border-gray-100 dark:border-gray-800">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Pièce</th>
                  <th className="pb-2 font-medium text-right">Qté</th>
                  <th className="pb-2 font-medium text-right">Prix unitaire</th>
                  <th className="pb-2 font-medium text-right">Total payé</th>
                  <th className="pb-2 font-medium text-right">Valeur or</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {goldLines.map((tx) => {
                  const nowValue = meltValueEUR(tx.symbol!) * tx.quantity
                  const diff = nowValue - tx.amountEUR
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-gray-50 dark:border-gray-800 last:border-0"
                    >
                      <td className="py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {tx.date}
                      </td>
                      <td className="py-2 text-gray-900 dark:text-gray-100">{tx.productName}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatQuantity(tx.quantity)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                        {formatEUR(tx.price)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">
                        {formatEUR(tx.amountEUR)}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums font-medium ${
                          diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                        }`}
                      >
                        {formatEUR(nowValue)}
                      </td>
                      <td className="py-2 text-right">
                        {confirmId === tx.id ? (
                          <span className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                removeTransaction(tx.id)
                                setConfirmId(null)
                              }}
                              className="text-xs px-2 py-1 rounded bg-red-600 text-white dark:text-gray-900"
                            >
                              Supprimer
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                            >
                              Annuler
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmId(tx.id)}
                            className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                            title="Supprimer cette ligne"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

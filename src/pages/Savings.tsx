import { useState } from 'react'
import type { Transaction } from '../types'
import type { ImportOutcome } from '../hooks/usePortfolio'
import type { SavingsBalance } from '../parsers/savingsManual'
import { isOpeningBalance, savingsBalance } from '../parsers/savingsManual'
import { formatEUR, formatHolding, formatNumber } from '../utils/formatters'
import { localToday } from '../utils/dates'
import { parseDecimalInput } from '../utils/input'

interface SavingsPageProps {
  transactions: Transaction[]
  savings: SavingsBalance | null
  savingsRate: { rate: number; since: string } | null
  addSavingsDeposit: (
    date: string,
    amountEUR: number,
    kind?: 'deposit' | 'opening'
  ) => ImportOutcome
  addCashMovement: (date: string, amountEUR: number) => ImportOutcome
  setSavingsBalance: (balanceEUR: number) => void
  removeTransaction: (id: string) => void
}

export function SavingsPage({
  transactions,
  savings,
  savingsRate,
  addSavingsDeposit,
  addCashMovement,
  setSavingsBalance,
  removeTransaction,
}: SavingsPageProps) {
  const [sub, setSub] = useState<'livret' | 'cash'>('livret')
  const savingsRows = transactions.filter((t) => t.account === 'savings')
  const deposits = savingsRows.filter((t) => t.interestEUR == null)
  const interestRows = savingsRows.filter((t) => t.interestEUR != null)

  // A statement carries its own interest lines; a hand-typed balance is only
  // needed when no statement has been imported.
  const {
    paidInEUR: paidIn,
    interestEUR: interest,
    balanceEUR: balance,
  } = savingsBalance(savingsRows, savings)
  const fromStatement = interestRows.length > 0

  const [date, setDate] = useState(localToday())
  const [amount, setAmount] = useState('')
  const [balanceInput, setBalanceInput] = useState(
    savings ? String(savings.balanceEUR) : ''
  )
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const [openingDate, setOpeningDate] = useState(localToday())
  const [openingAmount, setOpeningAmount] = useState('')
  const [openingError, setOpeningError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  function submitDeposit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseDecimalInput(amount)
    if (!Number.isFinite(value) || value === 0) {
      setOutcome({
        ok: false,
        warnings: [],
        message: 'Indique un montant (négatif pour un retrait).',
      })
      return
    }
    setOutcome(addSavingsDeposit(date, value))
    setAmount('')
  }

  function submitOpening(e: React.FormEvent) {
    e.preventDefault()
    const value = parseDecimalInput(openingAmount)
    if (!Number.isFinite(value) || value <= 0) {
      setOpeningError('Indique le solde actuel de ton livret.')
      return
    }
    const result = addSavingsDeposit(openingDate, value, 'opening')
    setOpeningError(result.ok ? null : result.message)
    if (result.ok) setOpeningAmount('')
  }

  function submitBalance(e: React.FormEvent) {
    e.preventDefault()
    const value = parseDecimalInput(balanceInput)
    if (!Number.isFinite(value) || value < 0) return
    setSavingsBalance(value)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const switcher = (
    <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
      {(
        [
          ['livret', 'Livret A', '#0ea5e9'],
          ['cash', 'Cash (billets)', '#64748b'],
        ] as const
      ).map(([id, label, color]) => (
        <button
          key={id}
          onClick={() => setSub(id)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2 ${
            sub === id
              ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm font-medium'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          {label}
        </button>
      ))}
    </div>
  )

  if (sub === 'cash') {
    return (
      <div className="space-y-6">
        {switcher}
        <CashSection
          transactions={transactions}
          addCashMovement={addCashMovement}
          removeTransaction={removeTransaction}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {switcher}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              Taux en vigueur
            </p>
            <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">
              {savingsRate ? `${formatNumber(savingsRate.rate)} %` : '—'}
            </p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
            {savingsRate
              ? `Relevé ${savingsRate.since}, source Caisse des Dépôts (données ouvertes). Il est affiché à titre indicatif : les intérêts affichés viennent du solde que tu saisis, pas d'un calcul.`
              : "Taux indisponible pour le moment — sans incidence, les intérêts se déduisent du solde saisi."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Solde actuel</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatEUR(balance)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {fromStatement
              ? 'calculé depuis le relevé importé'
              : savings
                ? `saisi le ${new Date(savings.updatedAt).toLocaleDateString('fr-FR')}`
                : 'jamais mis à jour'}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Versé au total</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatEUR(paidIn)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {deposits.length} mouvement{deposits.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Intérêts acquis</p>
          <p
            className={`text-2xl font-bold ${
              interest >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
            }`}
          >
            {interest >= 0 ? '+' : ''}
            {formatEUR(interest)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {fromStatement
              ? `${interestRows.length} versement${interestRows.length > 1 ? 's' : ''} d'intérêts`
              : paidIn > 0
                ? `${formatNumber((interest / paidIn) * 100)}% des versements`
                : '—'}
          </p>
        </div>
      </div>

      {fromStatement ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Relevé importé</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Le solde et les intérêts viennent du relevé Boursorama importé dans
            l'onglet Données — rien à saisir. Pour le mettre à jour, exporte un
            relevé plus récent et réimporte-le : les opérations déjà connues
            seront ignorées.
          </p>
          {interestRows.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {interestRows.map((t) => (
                <li
                  key={t.id}
                  className="text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-full px-3 py-1"
                >
                  {t.date} · +{formatEUR(t.interestEUR ?? 0)}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : deposits.length === 0 ? (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Solde de départ</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Aucun mouvement pour l'instant : indique le solde actuel de ton livret.
          Il sert de point de départ, compté comme apport, et les intérêts se
          mesureront à partir de là. Ajoute ensuite tes versements au fil de
          l'eau, et mets le solde à jour quand ta banque verse les intérêts.
        </p>

        <form onSubmit={submitOpening} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Date</span>
            <input
              type="date"
              value={openingDate}
              max={localToday()}
              onChange={(e) => setOpeningDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Solde (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              className="w-40 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
          </label>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white dark:text-gray-900 hover:bg-sky-700"
          >
            Enregistrer
          </button>
        </form>
        {openingError && (
          <p className="mt-4 rounded-lg px-4 py-3 text-sm bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">
            {openingError}
          </p>
        )}
      </div>
      ) : (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Mettre à jour le solde</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Recopie le solde affiché par ta banque. Les intérêts se déduisent de
          l'écart avec les versements, ce qui évite d'avoir à les calculer.
        </p>

        <form onSubmit={submitBalance} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Solde (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              placeholder={formatHolding(paidIn)}
              className="w-40 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
          </label>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white dark:text-gray-900 hover:bg-sky-700"
          >
            Enregistrer
          </button>
          {saved && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">Solde enregistré.</span>
          )}
        </form>
      </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Ajouter un mouvement</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Un versement se saisit en positif, un retrait en négatif. Ces montants
          servent de base pour mesurer les intérêts.
        </p>

        <form onSubmit={submitDeposit} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Date</span>
            <input
              type="date"
              value={date}
              max={localToday()}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Montant (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500"
              className="w-40 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
          </label>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200"
          >
            Ajouter
          </button>
        </form>

        {outcome && (
          <div
            className={`mt-4 rounded-lg px-4 py-3 text-sm ${
              outcome.ok
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
            }`}
          >
            {outcome.message}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <div className="flex items-baseline justify-between mb-4 gap-4">
          <h3 className="text-lg font-semibold">Mouvements</h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {savingsRows.length} ligne{savingsRows.length > 1 ? 's' : ''}
          </span>
        </div>

        {savingsRows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Aucun mouvement. Commence par ton solde de départ, ou par un
            versement.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 dark:text-gray-400 text-left border-b border-gray-100 dark:border-gray-800">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium text-right">Montant</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {savingsRows.map((tx) => {
                // Interest rows carry their amount apart: `amountEUR` is 0.
                const shown = tx.interestEUR ?? tx.amountEUR
                return (
                  <tr key={tx.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                    <td className="py-2 text-gray-600 dark:text-gray-400">{tx.date}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">
                      {isOpeningBalance(tx)
                        ? 'Solde de départ'
                        : tx.interestEUR != null
                          ? 'Intérêts'
                          : tx.amountEUR >= 0
                            ? 'Versement'
                            : 'Retrait'}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums font-medium ${
                        shown >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-500 dark:text-red-400'
                      }`}
                    >
                      {shown >= 0 ? '+' : ''}
                      {formatEUR(shown)}
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
        )}
      </div>
    </div>
  )
}

interface CashSectionProps {
  transactions: Transaction[]
  addCashMovement: (date: string, amountEUR: number) => ImportOutcome
  removeTransaction: (id: string) => void
}

/** Cash held physically: no rate, no market price. */
function CashSection({
  transactions,
  addCashMovement,
  removeTransaction,
}: CashSectionProps) {
  const moves = transactions.filter((t) => t.account === 'cash')
  const held = moves.reduce((s, t) => s + t.amountEUR, 0)

  const [date, setDate] = useState(localToday())
  const [amount, setAmount] = useState('')
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseDecimalInput(amount)
    if (!Number.isFinite(value) || value === 0) {
      setOutcome({
        ok: false,
        warnings: [],
        message: 'Indique un montant (négatif pour une dépense).',
      })
      return
    }
    setOutcome(addCashMovement(date, value))
    setAmount('')
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Cash détenu
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatEUR(held)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {moves.length} mouvement{moves.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Rendement
          </p>
          <p className="text-2xl font-bold text-gray-400 dark:text-gray-500">
            0,00 %
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            des billets ne produisent rien, et l'inflation les érode
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Ajouter un mouvement</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Un retrait au distributeur se saisit en positif, une dépense en
          négatif. Le total est ton encaisse.
        </p>

        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
              Date
            </span>
            <input
              type="date"
              value={date}
              max={localToday()}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
              Montant (€)
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              className="w-40 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200"
          >
            Ajouter
          </button>
        </form>

        {outcome && (
          <div
            className={`mt-4 rounded-lg px-4 py-3 text-sm ${
              outcome.ok
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
            }`}
          >
            {outcome.message}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <div className="flex items-baseline justify-between mb-4 gap-4">
          <h3 className="text-lg font-semibold">Mouvements</h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {moves.length} ligne{moves.length > 1 ? 's' : ''}
          </span>
        </div>

        {moves.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Aucun mouvement enregistré.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 dark:text-gray-400 text-left border-b border-gray-100 dark:border-gray-800">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium text-right">Montant</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {moves.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-gray-50 dark:border-gray-800 last:border-0"
                >
                  <td className="py-2 text-gray-600 dark:text-gray-400">
                    {tx.date}
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums font-medium ${
                      tx.amountEUR >= 0
                        ? 'text-gray-900 dark:text-gray-100'
                        : 'text-red-500 dark:text-red-400'
                    }`}
                  >
                    {tx.amountEUR >= 0 ? '+' : ''}
                    {formatEUR(tx.amountEUR)}
                  </td>
                  <td className="py-2 text-right">
                    {confirmId === tx.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            removeTransaction(tx.id)
                            setConfirmId(null)
                          }}
                          className="text-xs px-2 py-1 rounded bg-red-600 text-white"
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
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

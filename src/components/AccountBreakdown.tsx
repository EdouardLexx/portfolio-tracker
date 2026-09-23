import type { AccountKind, Position, Transaction } from '../types'
import { ACCOUNTS } from '../types'
import { summarisePerAccount } from '../utils/calculations'
import { formatEUR, formatNumber } from '../utils/formatters'

interface AccountBreakdownProps {
  transactions: Transaction[]
  positions: Position[]
  onSelect: (account: AccountKind) => void
}

export function AccountBreakdown({
  transactions,
  positions,
  onSelect,
}: AccountBreakdownProps) {
  const rows = summarisePerAccount(transactions, positions)
  if (rows.length < 2) return null

  const totalValue = rows.reduce((s, r) => s + r.valueEUR, 0)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Répartition par compte</h3>

      <div className="flex h-2.5 rounded-full overflow-hidden mb-4">
        {rows.map((r) => {
          const meta = ACCOUNTS.find((m) => m.kind === r.account)
          const share = totalValue > 0 ? (r.valueEUR / totalValue) * 100 : 0
          return (
            <div
              key={r.account}
              style={{ width: `${share}%`, backgroundColor: meta?.color }}
              title={`${meta?.shortLabel} ${formatNumber(share, 1)}%`}
            />
          )
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r) => {
          const meta = ACCOUNTS.find((m) => m.kind === r.account)
          const pnl = r.valueEUR - r.costEUR
          const pct = r.costEUR > 0 ? (pnl / r.costEUR) * 100 : 0
          const share = totalValue > 0 ? (r.valueEUR / totalValue) * 100 : 0

          return (
            <button
              key={r.account}
              onClick={() => onSelect(r.account)}
              className="text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-4 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: meta?.color }}
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {meta?.label ?? r.account}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
                  {formatNumber(share, 1)}%
                </span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatEUR(r.valueEUR)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                sur {formatEUR(r.costEUR)} investis
              </p>
              <p
                className={`text-sm font-medium mt-1 ${
                  pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                }`}
              >
                {pnl >= 0 ? '+' : ''}
                {formatEUR(pnl)} ({pnl >= 0 ? '+' : ''}
                {formatNumber(pct)}%)
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

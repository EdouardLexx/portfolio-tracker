import type { Position } from '../types'
import { ACCOUNTS } from '../types'
import {
  formatEUR,
  formatNumber,
  formatMoney,
  formatQuantity,
  readableTextOn,
} from '../utils/formatters'

interface PositionsTableProps {
  positions: Position[]
  showAccount: boolean
}

export function PositionsTable({ positions, showAccount }: PositionsTableProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-lg font-semibold">Positions</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-left">
              <th className="px-4 py-3 font-medium">Nom</th>
              {showAccount && <th className="px-4 py-3 font-medium">Compte</th>}
              <th className="px-4 py-3 font-medium text-right">Qté</th>
              <th className="px-4 py-3 font-medium text-right">PRU</th>
              <th className="px-4 py-3 font-medium text-right">Coût</th>
              <th className="px-4 py-3 font-medium text-right">Prix</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium text-right">P&L</th>
              <th className="px-4 py-3 font-medium text-right">%Perf</th>
              <th className="px-4 py-3 font-medium text-right">%CAGR</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const positive = pos.pnlEUR >= 0
              const color = positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
              const foreign = pos.currency !== 'EUR'

              return (
                <tr
                  key={pos.key}
                  className="border-t border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{pos.name}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {pos.ticker || pos.isin}
                    </div>
                  </td>
                  {showAccount && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {pos.accounts.map((a) => {
                          const meta = ACCOUNTS.find((m) => m.kind === a)
                          return (
                            <span
                              key={a}
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{
                                backgroundColor: meta?.color,
                                color: readableTextOn(meta?.color ?? '#9ca3af'),
                              }}
                            >
                              {meta?.shortLabel ?? a}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                    {formatQuantity(pos.quantity)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                    <div>{formatEUR(pos.avgCostEUR)}</div>
                    {foreign && (
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {formatMoney(pos.avgCostLocal, pos.currency)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                    {formatEUR(pos.totalCostEUR)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                    {pos.priced ? (
                      <>
                        <div>{formatEUR(pos.currentPriceEUR)}</div>
                        {foreign && (
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            {formatMoney(pos.currentPriceLocal, pos.currency)}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 text-xs">non coté</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                    {formatEUR(pos.currentValueEUR)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium tabular-nums ${color}`}
                  >
                    {positive ? '+' : ''}
                    {formatEUR(pos.pnlEUR)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium tabular-nums ${color}`}
                  >
                    {positive ? '+' : ''}
                    {formatNumber(pos.pnlPercent)}%
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium tabular-nums ${color}`}
                  >
                    {pos.cagrPercent == null ? (
                      <span
                        className="text-gray-400 dark:text-gray-500"
                        title="Détenu depuis moins d'un an"
                      >
                        —
                      </span>
                    ) : (
                      `${formatNumber(pos.cagrPercent)}%`
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

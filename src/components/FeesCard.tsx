import type { PortfolioSummary, Position } from '../types'
import { formatEUR, formatNumber } from '../utils/formatters'

interface FeesCardProps {
  summary: PortfolioSummary
  positions: Position[]
}

export function FeesCard({ summary, positions }: FeesCardProps) {
  const rows = [...positions]
    .filter((p) => p.feesEUR > 0)
    .sort((a, b) => b.feesEUR - a.feesEUR)

  const brokerShare =
    summary.totalFeesEUR > 0
      ? (summary.brokerFeesEUR / summary.totalFeesEUR) * 100
      : 0
  const fxShare =
    summary.totalFeesEUR > 0 ? (summary.fxFeesEUR / summary.totalFeesEUR) * 100 : 0

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-lg font-semibold">Frais</h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {summary.orderCount} ordres passés
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total payé</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatEUR(summary.totalFeesEUR)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formatNumber(summary.feesPercentOfInvested)}% des montants investis
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Courtage</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatEUR(summary.brokerFeesEUR)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formatNumber(brokerShare, 0)}% du total
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Change (AutoFX)</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatEUR(summary.fxFeesEUR)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formatNumber(fxShare, 0)}% du total
          </p>
        </div>
      </div>

      <div className="flex h-2 rounded-full overflow-hidden mb-5">
        <div
          className="bg-blue-500"
          style={{ width: `${brokerShare}%` }}
          title={`Courtage ${formatNumber(brokerShare, 0)}%`}
        />
        <div
          className="bg-amber-400"
          style={{ width: `${fxShare}%` }}
          title={`Change ${formatNumber(fxShare, 0)}%`}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 dark:text-gray-400 text-left border-b border-gray-100 dark:border-gray-800">
              <th className="pb-2 font-medium">Action</th>
              <th className="pb-2 font-medium text-right">Ordres</th>
              <th className="pb-2 font-medium text-right">Courtage</th>
              <th className="pb-2 font-medium text-right">Change</th>
              <th className="pb-2 font-medium text-right">Total</th>
              <th className="pb-2 font-medium text-right">% investi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.key} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                <td className="py-2 font-medium text-gray-900 dark:text-gray-100">
                  {p.ticker || p.isin}
                </td>
                <td className="py-2 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                  {p.orderCount}
                </td>
                <td className="py-2 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                  {formatEUR(p.brokerFeesEUR)}
                </td>
                <td className="py-2 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                  {formatEUR(p.fxFeesEUR)}
                </td>
                <td className="py-2 text-right font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                  {formatEUR(p.feesEUR)}
                </td>
                <td className="py-2 text-right text-gray-500 dark:text-gray-400 tabular-nums">
                  {formatNumber((p.feesEUR / p.totalCostEUR) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 dark:border-gray-700">
              <td className="pt-2 font-semibold text-gray-900 dark:text-gray-100">Total</td>
              <td className="pt-2 text-right font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                {summary.orderCount}
              </td>
              <td className="pt-2 text-right font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                {formatEUR(summary.brokerFeesEUR)}
              </td>
              <td className="pt-2 text-right font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                {formatEUR(summary.fxFeesEUR)}
              </td>
              <td className="pt-2 text-right font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                {formatEUR(summary.totalFeesEUR)}
              </td>
              <td className="pt-2 text-right font-semibold text-gray-500 dark:text-gray-400 tabular-nums">
                {formatNumber(summary.feesPercentOfInvested)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

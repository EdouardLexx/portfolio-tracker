import type {
  PortfolioSummary,
  Position,
  HistoricalPrice,
  Transaction,
  SymbolInfo,
  AccountKind,
} from '../types'
import type { Scope } from '../hooks/usePortfolio'
import { ValueCard } from '../components/ValueCard'
import { PerformanceChart } from '../components/PerformanceChart'
import { WealthChart } from '../components/WealthChart'
import { AllocationChart } from '../components/AllocationChart'
import { AccountBreakdown } from '../components/AccountBreakdown'
import { PerformanceDistribution } from '../components/PerformanceDistribution'
import { PositionsTable } from '../components/PositionsTable'
import { FeesCard } from '../components/FeesCard'
import { formatEUR, formatNumber } from '../utils/formatters'

interface InvestmentsPageProps {
  scope: Scope
  summary: PortfolioSummary
  positions: Position[]
  history: Record<string, HistoricalPrice[]>
  spHistory: HistoricalPrice[]
  ndxHistory: HistoricalPrice[]
  fxHistory: Record<string, HistoricalPrice[]>
  rates: Record<string, number>
  symbols: Record<string, SymbolInfo>
  transactions: Transaction[]
  onSelectAccount: (account: AccountKind) => void
}

export function InvestmentsPage({
  scope,
  summary,
  positions,
  history,
  spHistory,
  ndxHistory,
  fxHistory,
  rates,
  symbols,
  transactions,
  onSelectAccount,
}: InvestmentsPageProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ValueCard
          title="Valeur totale"
          mainValue={formatEUR(summary.totalValueEUR)}
          subtitle={`sur ${formatEUR(summary.totalCostEUR)} investis`}
        />
        <ValueCard
          title="Performance"
          mainValue={formatEUR(summary.totalPnlEUR)}
          mainColor={
            summary.totalPnlEUR >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-500 dark:text-red-400'
          }
          subtitle={
            summary.cagrPercent == null
              ? `depuis le ${summary.firstDate}`
              : 'CAGR (rendement annualisé)'
          }
          subtitleValue={
            summary.cagrPercent == null
              ? undefined
              : `${formatNumber(summary.cagrPercent)}%`
          }
          subtitleColor="text-gray-500 dark:text-gray-400"
        />
        <ValueCard
          title="Plus-values latentes"
          mainValue={`${summary.totalPnlPercent >= 0 ? '+' : ''}${formatNumber(summary.totalPnlPercent)}%`}
          mainColor={
            summary.totalPnlPercent >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-500 dark:text-red-400'
          }
          subtitle={`Frais totaux: ${formatEUR(summary.totalFeesEUR)}`}
        />
      </div>

      {scope === 'all' && (
        <AccountBreakdown
          transactions={transactions}
          positions={positions}
          onSelect={onSelectAccount}
        />
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <AllocationChart positions={positions} wide />
      </div>

      <PositionsTable positions={positions} showAccount={scope === 'all'} />

      {/* Performance and value always travel together: one is the return,
          the other what it weighs. */}
      <PerformanceChart
        history={history}
        spHistory={spHistory}
        ndxHistory={ndxHistory}
        fxHistory={fxHistory}
        rates={rates}
        symbols={symbols}
        transactions={transactions}
      />

      <WealthChart
        title="Valeur des investissements"
        transactions={transactions}
        history={history}
        fxHistory={fxHistory}
        rates={rates}
        symbols={symbols}
      />

      <PerformanceDistribution positions={positions} />

      <FeesCard summary={summary} positions={positions} />
    </div>
  )
}

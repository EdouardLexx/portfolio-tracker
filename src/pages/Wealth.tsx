import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useMemo } from 'react'
import type {
  Position,
  Transaction,
  AccountKind,
  HistoricalPrice,
  SymbolInfo,
  Loan,
} from '../types'
import { WealthChart } from '../components/WealthChart'
import { NetWealthChart } from '../components/NetWealthChart'
import { buildLoanSchedule, totalDebtOn } from '../utils/loans'
import { localToday } from '../utils/dates'
import { WealthProjection } from '../components/WealthProjection'
import { ACCOUNTS } from '../types'
import { summarisePerAccount } from '../utils/calculations'
import { formatEUR, formatNumber } from '../utils/formatters'
import { useIsDark, chartTheme } from '../hooks/useTheme'

/**
 * Asset classes, above the account level. Adding a class here is what makes it
 * appear on this page — see the "à venir" block for the ones not wired yet.
 */
type ClassId = 'invest' | 'savings' | 'realestate'

const CLASSES: {
  id: ClassId
  label: string
  description: string
  color: string
  accounts: AccountKind[]
}[] = [
  {
    id: 'invest',
    label: 'Investissements',
    description: 'PEA, CTO, crypto et or physique',
    color: '#3b82f6',
    accounts: ['pea', 'degiro', 'ledger', 'gold'],
  },
  {
    id: 'savings',
    label: 'Épargne',
    description: 'Livret A et cash',
    color: '#0ea5e9',
    accounts: ['savings', 'cash'],
  },
  {
    id: 'realestate',
    label: 'Immobilier',
    description: 'pas encore suivi',
    color: '#a3a3a3',
    accounts: [],
  },
]

interface WealthPageProps {
  transactions: Transaction[]
  positions: Position[]
  history: Record<string, HistoricalPrice[]>
  fxHistory: Record<string, HistoricalPrice[]>
  rates: Record<string, number>
  symbols: Record<string, SymbolInfo>
  loans: Loan[]
  onOpenInvestments: () => void
}

export function WealthPage({
  transactions,
  positions,
  history,
  fxHistory,
  rates,
  symbols,
  loans,
  onOpenInvestments,
}: WealthPageProps) {
  const theme = chartTheme(useIsDark())
  const perAccount = summarisePerAccount(transactions, positions)

  const rows = CLASSES.map((c) => {
    const accounts = perAccount.filter((a) => c.accounts.includes(a.account))
    return {
      ...c,
      valueEUR: accounts.reduce((s, a) => s + a.valueEUR, 0),
      costEUR: accounts.reduce((s, a) => s + a.costEUR, 0),
      accounts,
    }
  })

  const totalValue = rows.reduce((s, r) => s + r.valueEUR, 0)
  const totalCost = rows.reduce((s, r) => s + r.costEUR, 0)
  const totalGain = totalValue - totalCost
  const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  const funded = rows.filter((r) => r.valueEUR > 0)

  // Everything below about debt only exists once a loan is recorded.
  const debt = useMemo(
    () =>
      totalDebtOn(
        loans.map((loan) => ({ loan, schedule: buildLoanSchedule(loan) })),
        localToday()
      ),
    [loans]
  )
  const hasLoans = loans.length > 0

  return (
    <div className="space-y-6">
      <div
        className={`grid grid-cols-1 gap-4 ${
          hasLoans ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'
        }`}
      >
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Patrimoine total
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {formatEUR(totalValue)}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            sur {formatEUR(totalCost)} apportés
          </p>
        </div>
        {hasLoans && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Patrimoine net
            </p>
            <p className="text-3xl font-bold text-violet-600 dark:text-violet-400">
              {formatEUR(totalValue - debt)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              après {formatEUR(debt)} restant dû
            </p>
          </div>
        )}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Gain total
          </p>
          <p
            className={`text-3xl font-bold ${
              totalGain >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-500 dark:text-red-400'
            }`}
          >
            {totalGain >= 0 ? '+' : ''}
            {formatEUR(totalGain)}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {totalGain >= 0 ? '+' : ''}
            {formatNumber(gainPct)}% de l'apport
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Répartition
          </p>
          <div className="space-y-1.5 mt-3">
            {funded.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: r.color }}
                />
                <span className="flex-1 text-gray-700 dark:text-gray-300">
                  {r.label}
                </span>
                <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                  {formatNumber((r.valueEUR / totalValue) * 100, 1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Par classe d'actifs</h3>

        <div className="flex flex-col lg:flex-row items-center gap-8">
          <div className="w-[220px] h-[220px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={funded}
                  dataKey="valueEUR"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={64}
                  outerRadius={106}
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {funded.map((r) => (
                    <Cell key={r.id} fill={r.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatEUR(value),
                    name,
                  ]}
                  contentStyle={theme.tooltip}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex-1 min-w-0 w-full space-y-3">
            {rows.map((r) => {
              const gain = r.valueEUR - r.costEUR
              const pct = r.costEUR > 0 ? (gain / r.costEUR) * 100 : 0
              const share = totalValue > 0 ? (r.valueEUR / totalValue) * 100 : 0
              const empty = r.valueEUR === 0

              return (
                <div
                  key={r.id}
                  className={`rounded-lg p-4 ${
                    empty
                      ? 'border border-dashed border-gray-200 dark:border-gray-700'
                      : 'bg-gray-50 dark:bg-gray-800'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0 self-center"
                      style={{ backgroundColor: r.color }}
                    />
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {r.label}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {r.description}
                    </span>
                    <span className="ml-auto font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                      {empty ? '—' : formatEUR(r.valueEUR)}
                    </span>
                    {!empty && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums w-12 text-right">
                        {formatNumber(share, 1)}%
                      </span>
                    )}
                  </div>

                  {!empty && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        apporté {formatEUR(r.costEUR)}
                      </span>
                      <span
                        className={
                          gain >= 0
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-red-500 dark:text-red-400 font-medium'
                        }
                      >
                        {gain >= 0 ? '+' : ''}
                        {formatEUR(gain)} ({gain >= 0 ? '+' : ''}
                        {formatNumber(pct)}%)
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {r.accounts
                          .map(
                            (a) =>
                              ACCOUNTS.find((m) => m.kind === a.account)
                                ?.shortLabel ?? a.account
                          )
                          .join(' · ')}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <WealthChart
        transactions={transactions}
        history={history}
        fxHistory={fxHistory}
        rates={rates}
        symbols={symbols}
      />

      {hasLoans && (
        <NetWealthChart
          transactions={transactions}
          history={history}
          fxHistory={fxHistory}
          rates={rates}
          symbols={symbols}
          loans={loans}
        />
      )}

      <WealthProjection
        transactions={transactions}
        currentValue={totalValue}
      />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Ce qui manque encore</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Cette page additionne tout ce que l'application sait valoriser. Les
          classes ci-dessous sont prévues dans la structure mais ne sont pas
          implémentées — elles apparaîtront ici dès qu'une source les alimentera.
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          {[
            [
              'Immobilier',
              'Résidence et locatif, valorisés à la main comme le Livret A.',
            ],
            [
              'Assurance-vie',
              'Relevé annuel, même principe que le PEA.',
            ],
            [
              'Comptes courants',
              'Solde saisi manuellement, sans performance.',
            ],
          ].map(([title, detail]) => (
            <li
              key={title}
              className="border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                {title}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onOpenInvestments}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        Voir le détail des investissements →
      </button>
    </div>
  )
}

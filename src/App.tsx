import { useState } from 'react'
import { usePortfolio, type Scope } from './hooks/usePortfolio'
import { useTheme } from './hooks/useTheme'
import { useDiscreet } from './hooks/useDiscreet'
import { ACCOUNTS, SAVINGS_KINDS } from './types'
import { WealthPage } from './pages/Wealth'
import { InvestmentsPage } from './pages/Investments'
import { DataPage } from './pages/Data'
import { GoldPage } from './pages/Gold'
import { SavingsPage } from './pages/Savings'

// AGPL §13: a modified version offered to users must point to its own source.
const SOURCE_URL = 'https://github.com/EdouardLexx/portfolio-tracker'

type Tab = 'wealth' | 'investments' | 'gold' | 'savings' | 'data'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'wealth', label: 'Patrimoine', icon: '◈' },
  { id: 'investments', label: 'Investissements', icon: '▤' },
  { id: 'gold', label: 'Or', icon: '◉' },
  { id: 'savings', label: 'Épargne', icon: '▬' },
  { id: 'data', label: 'Données', icon: '⛁' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('wealth')
  const [scope, setScope] = useState<Scope>('all')
  const { isDark, toggle } = useTheme()
  const { discreet, toggle: toggleDiscreet } = useDiscreet()

  const {
    allTransactions,
    transactions,
    positions,
    allPositions,
    summary,
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
    reload,
    importFiles,
    addGoldEntry,
    addSavingsDeposit,
    addCashMovement,
    setSavingsBalance,
    savings,
    savingsRate,
    removeTransaction,
    removeTransactionsAt,
    meltValueEUR,
    goldSpotUSD,
    resetData,
  } = usePortfolio(scope)

  if (loading && !allTransactions.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-gray-200 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            Chargement du portefeuille...
          </p>
        </div>
      </div>
    )
  }

  // Only offer scopes that actually hold something, plus the combined view.
  const scopes: { id: Scope; label: string; color?: string }[] = [
    { id: 'all', label: 'Tous les comptes' },
    ...ACCOUNTS.filter(
      (a) => !SAVINGS_KINDS.includes(a.kind) && accountsPresent.includes(a.kind)
    ).map((a) => ({
      id: a.kind as Scope,
      label: a.shortLabel,
      color: a.color,
    })),
  ]

  function renderTab() {
    if (tab === 'wealth') {
      return (
        <WealthPage
          transactions={allTransactions}
          positions={allPositions}
          history={history}
          fxHistory={fxHistory}
          rates={rates}
          symbols={symbols}
          onOpenInvestments={() => setTab('investments')}
        />
      )
    }

    if (tab === 'gold') {
      return (
        <GoldPage
          transactions={allTransactions}
          positions={allPositions}
          goldSpotUSD={goldSpotUSD}
          usdRate={rates.USD ?? 1}
          meltValueEUR={meltValueEUR}
          addGoldEntry={addGoldEntry}
          removeTransaction={removeTransaction}
        />
      )
    }

    if (tab === 'savings') {
      return (
        <SavingsPage
          transactions={allTransactions}
          savings={savings}
          savingsRate={savingsRate}
          addSavingsDeposit={addSavingsDeposit}
          addCashMovement={addCashMovement}
          setSavingsBalance={setSavingsBalance}
          removeTransaction={removeTransaction}
        />
      )
    }

    if (tab === 'data') {
      return (
        <DataPage
          transactions={allTransactions}
          positions={allPositions}
          imports={imports}
          symbols={symbols}
          unresolvedIsins={unresolvedIsins}
          importFiles={importFiles}
          removeTransactionsAt={removeTransactionsAt}
          resetData={resetData}
        />
      )
    }

    if (error) {
      return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-8 text-center shadow-sm">
          <p className="text-red-500 dark:text-red-400 font-medium mb-2">
            Erreur de chargement
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">{error}</p>
          <button
            onClick={reload}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm hover:bg-gray-800 dark:hover:bg-gray-200"
          >
            Réessayer
          </button>
        </div>
      )
    }

    if (!summary) {
      return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-8 text-center shadow-sm">
          <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">
            Aucune position
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
            {scope === 'all'
              ? 'Importe un relevé pour commencer.'
              : 'Ce compte ne contient aucune position.'}
          </p>
          <button
            onClick={() => setTab('data')}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm hover:bg-gray-800 dark:hover:bg-gray-200"
          >
            Aller aux données
          </button>
        </div>
      )
    }

    return (
      <InvestmentsPage
        scope={scope}
        summary={summary}
        positions={positions}
        history={history}
        spHistory={spHistory}
        ndxHistory={ndxHistory}
        fxHistory={fxHistory}
        rates={rates}
        symbols={symbols}
        transactions={transactions}
        onSelectAccount={(account) => setScope(account)}
      />
    )
  }

  const navButton = (t: (typeof TABS)[number], compact = false) => (
    <button
      key={t.id}
      onClick={() => setTab(t.id)}
      className={
        compact
          ? `px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${
              tab === t.id
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                : 'text-gray-600 dark:text-gray-400'
            }`
          : `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
              tab === t.id
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
            }`
      }
    >
      {!compact && <span className="w-4 text-center opacity-60">{t.icon}</span>}
      <span className="flex-1">{t.label}</span>
      {t.id === 'data' && unresolvedIsins.length > 0 && (
        <span className="bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-xs px-1.5 py-0.5 rounded-full">
          {unresolvedIsins.length}
        </span>
      )}
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="flex">
        <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 min-h-screen px-3 py-6 sticky top-0 h-screen">
          <div className="px-3 mb-8">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Portefeuille
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {accountsPresent.length} compte
              {accountsPresent.length > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {rates.USD
                ? `EUR/USD ${rates.USD.toFixed(4)}`
                : 'positions en euros'}
            </p>
          </div>

          <nav className="flex flex-col gap-1">
            {TABS.map((t) => navButton(t))}
          </nav>

          <button
            onClick={toggleDiscreet}
            aria-pressed={discreet}
            className="mt-auto flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <span className="w-4 text-center opacity-60">
              {discreet ? '◍' : '◌'}
            </span>
            <span>{discreet ? 'Afficher les montants' : 'Mode discret'}</span>
          </button>

          <button
            onClick={toggle}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <span className="w-4 text-center opacity-60">
              {isDark ? '☀' : '☾'}
            </span>
            <span>{isDark ? 'Mode clair' : 'Mode sombre'}</span>
          </button>
        </aside>

        <div className="flex-1 min-w-0">
          {/* Compact nav for narrow screens, where a sidebar would crowd out
              the content. */}
          <nav className="md:hidden flex items-center gap-1 overflow-x-auto bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2">
            {TABS.map((t) => navButton(t, true))}
            <button
              onClick={toggleDiscreet}
              aria-pressed={discreet}
              className="ml-auto px-2 py-1.5 text-gray-500 dark:text-gray-400"
              title={discreet ? 'Afficher les montants' : 'Mode discret'}
            >
              {discreet ? '◍' : '◌'}
            </button>
            <button
              onClick={toggle}
              className="px-2 py-1.5 text-gray-500 dark:text-gray-400"
              title={isDark ? 'Mode clair' : 'Mode sombre'}
            >
              {isDark ? '☀' : '☾'}
            </button>
          </nav>

          <div className="max-w-[1500px] mx-auto px-6 py-8">
            <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {TABS.find((t) => t.id === tab)?.label}
              </h2>

              {/* The account filter only makes sense where several accounts
                  are shown side by side. */}
              {tab === 'investments' && (
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                  {scopes.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setScope(s.id)}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2 ${
                        scope === s.id
                          ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm font-medium'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                      }`}
                    >
                      {s.color && (
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                      )}
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </header>

            {renderTab()}

            <footer className="mt-10 pt-4 border-t border-gray-200 dark:border-gray-800 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
              <span>© 2026 EdouardLexx · logiciel libre, fourni sans garantie</span>
              <a
                href={SOURCE_URL}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-gray-600 dark:hover:text-gray-300"
              >
                Code source (AGPL-3.0)
              </a>
              <a
                href="/THIRD_PARTY_LICENSES.txt"
                target="_blank"
                className="underline hover:text-gray-600 dark:hover:text-gray-300"
              >
                Licences des composants
              </a>
            </footer>
          </div>
        </div>
      </div>
    </div>
  )
}

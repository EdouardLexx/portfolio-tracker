import { useCallback, useMemo, useRef, useState } from 'react'
import type { Transaction, ImportRecord, Position, SymbolInfo } from '../types'
import { ACCOUNTS, SAVINGS_KINDS } from '../types'
import type { ImportOutcome } from '../hooks/usePortfolio'
import {
  formatEUR,
  formatMoney,
  formatQuantity,
  readableTextOn,
} from '../utils/formatters'
import { parseBackup, type Backup } from '../utils/backup'
import type { DriveSync } from '../hooks/useDriveSync'
import { FOLDER_NAME } from '../api/googleDrive'
import { DriveIcon } from '../components/DriveIcon'
import { formatSyncTime, localToday } from '../utils/dates'

interface DataPageProps {
  transactions: Transaction[]
  positions: Position[]
  imports: ImportRecord[]
  symbols: Record<string, SymbolInfo>
  unresolvedIsins: string[]
  importFiles: (files: File[]) => Promise<ImportOutcome>
  removeTransactionsAt: (indices: number[]) => void
  exportBackup: () => Backup
  restoreBackup: (backup: Backup, mode: 'merge' | 'replace') => ImportOutcome
  drive: DriveSync
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

/** `label` and `color` stand in for sources that are not accounts (loans). */
function AccountBadge({
  kind,
  label,
  color,
}: {
  kind: string
  label?: string
  color?: string
}) {
  const found = ACCOUNTS.find((m) => m.kind === kind)
  const meta = label ? { shortLabel: label, color } : found
  const background = meta?.color ?? '#9ca3af'
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: background, color: readableTextOn(background) }}
    >
      {meta?.shortLabel ?? kind}
    </span>
  )
}

/**
 * What the import accepts today, stated as the parsers implement it: format
 * detection, account assignment and what gets skipped.
 */
const FILE_SOURCES = [
  {
    account: 'degiro',
    source: 'Compte-titres DEGIRO',
    format: 'CSV',
    file: 'Export « Transactions », avec l’interface DEGIRO en français.',
    note: 'Les ventes sont ignorées.',
  },
  {
    account: 'pea',
    source: 'PEA Boursorama',
    format: 'PDF',
    file: 'Avis d’opéré « Opération de bourse », un par exécution ; plusieurs à la fois.',
    note: 'Les ventes sont ignorées. Les avis d’un compte-titres Boursorama ne sont pas encore gérés.',
  },
  {
    account: 'ledger',
    source: 'Crypto Ledger Live',
    format: 'CSV',
    file: 'Export de l’historique des opérations.',
    note: 'Seules les réceptions confirmées comptent ; les envois sont ignorés.',
  },
  {
    account: 'savings',
    source: 'Livret A Boursorama',
    format: 'CSV',
    file: 'Relevé des opérations du livret, intérêts compris.',
    note: 'Uniquement le relevé du Livret A : un autre compte serait compté comme livret.',
  },
]

const MANUAL_SOURCES = [
  {
    account: 'gold',
    source: 'Or physique',
    where: 'onglet Or',
    what: 'Vreneli, Napoléon ou Krugerrand : date, nombre de pièces, prix payé (facultatif).',
  },
  {
    account: 'savings',
    source: 'Livret A',
    where: 'onglet Épargne',
    what: 'Solde de départ, versements et retraits, puis le solde affiché par la banque, si tu n’importes pas le relevé.',
  },
  {
    account: 'cash',
    source: 'Cash (billets)',
    where: 'onglet Épargne',
    what: 'Entrées et sorties d’argent liquide.',
  },
  {
    account: 'loan',
    badgeLabel: 'Emprunt',
    badgeColor: '#8b5cf6',
    source: 'Emprunts',
    where: 'onglet Emprunts',
    what: 'Prêt étudiant, conso, auto : montant, taux, durée, différé, assurance, frais.',
  },
]

const NOT_SUPPORTED_YET =
  'ventes et retraits de titres, dividendes, autres courtiers, assurance-vie, immobilier et prêts immobiliers, remboursements anticipés, comptes courants.'

function SupportedData() {
  const rowClass =
    'py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4'
  const headingClass =
    'text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'
  return (
    <Card title="Données compatibles pour l'instant">
      <h4 className={headingClass}>Fichiers à importer ci-dessus</h4>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800 mb-5">
        {FILE_SOURCES.map((s) => (
          <li key={s.source} className={rowClass}>
            <div className="flex items-center gap-2 sm:w-52 shrink-0">
              <AccountBadge kind={s.account} />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {s.source}
              </span>
            </div>
            <span className="self-start text-xs font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              {s.format}
            </span>
            <div className="text-sm">
              <p className="text-gray-700 dark:text-gray-300">{s.file}</p>
              <p className="text-gray-500 dark:text-gray-400">{s.note}</p>
            </div>
          </li>
        ))}
      </ul>

      <h4 className={headingClass}>Saisie manuelle</h4>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800 mb-5">
        {MANUAL_SOURCES.map((s) => (
          <li key={s.source} className={rowClass}>
            <div className="flex items-center gap-2 sm:w-52 shrink-0">
              <AccountBadge kind={s.account} label={s.badgeLabel} color={s.badgeColor} />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {s.source}
              </span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="text-gray-500 dark:text-gray-400">{s.where} — </span>
              {s.what}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          Pas encore pris en charge :
        </span>{' '}
        {NOT_SUPPORTED_YET}
      </p>
    </Card>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

function OutcomeBanner({ outcome }: { outcome: ImportOutcome }) {
  return (
    <p
      className={`mt-4 rounded-lg px-4 py-3 text-sm ${
        outcome.ok
          ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
          : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
      }`}
    >
      {outcome.message}
    </p>
  )
}

/**
 * The whole portfolio to a file and back: a safety copy, and the way to move
 * it to another browser or device, since each one keeps its own data.
 */
function BackupCard({
  exportBackup,
  restoreBackup,
}: {
  exportBackup: () => Backup
  restoreBackup: (backup: Backup, mode: 'merge' | 'replace') => ImportOutcome
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Backup | null>(null)
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)

  function download() {
    const backup = exportBackup()
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `portefeuille-sauvegarde-${localToday()}.json`
    link.click()
    // Revoked later: Firefox cancels a download whose URL goes away at once.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setPending(null)
    setOutcome({
      ok: true,
      warnings: [],
      message: `Sauvegarde exportée : ${plural(backup.data.transactions.length, 'ligne')} et ${plural(backup.data.loans.length, 'emprunt')}.`,
    })
  }

  async function choose(list: FileList | null) {
    const file = list?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    const result = parseBackup(await file.text())
    if ('error' in result) {
      setPending(null)
      setOutcome({ ok: false, warnings: [], message: result.error })
      return
    }
    setPending(result.backup)
    setOutcome(null)
  }

  function apply(mode: 'merge' | 'replace') {
    if (!pending) return
    setOutcome(restoreBackup(pending, mode))
    setPending(null)
  }

  const exportedAt = pending?.exportedAt
    ? new Date(pending.exportedAt).toLocaleString('fr-FR', {
        dateStyle: 'long',
        timeStyle: 'short',
      })
    : null

  return (
    <Card title="Sauvegarde">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Chaque navigateur garde ses propres données. Exporte tout (relevés,
        saisies, emprunts) dans un fichier pour le mettre à l'abri ou le
        transférer vers un autre navigateur, un autre ordinateur ou ton
        téléphone. Le fichier contient tes données en clair : range-le en lieu
        sûr et ne le partage pas.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={download}
          className="px-4 py-2 text-sm rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200"
        >
          Exporter une sauvegarde
        </button>
        <label className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
          Importer une sauvegarde
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => choose(e.target.files)}
          />
        </label>
      </div>

      {pending && (
        <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm">
          <p className="text-gray-900 dark:text-gray-100 font-medium">
            Sauvegarde{exportedAt ? ` du ${exportedAt}` : ''} :{' '}
            {plural(pending.data.transactions.length, 'ligne')} et{' '}
            {plural(pending.data.loans.length, 'emprunt')}.
          </p>
          <ul className="mt-2 space-y-1 text-gray-500 dark:text-gray-400">
            <li>
              <span className="font-medium text-gray-700 dark:text-gray-300">Fusionner</span>{' '}
              ajoute ce qui manque ici, sans rien modifier ni effacer.
            </li>
            <li>
              <span className="font-medium text-gray-700 dark:text-gray-300">Tout remplacer</span>{' '}
              rend ce navigateur identique au fichier : ce qui n'y figure pas est
              supprimé.
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => apply('merge')}
              className="px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200"
            >
              Fusionner
            </button>
            <button
              onClick={() => apply('replace')}
              className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
            >
              Tout remplacer
            </button>
            <button
              onClick={() => setPending(null)}
              className="px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {outcome && <OutcomeBanner outcome={outcome} />}
    </Card>
  )
}

/**
 * Same portfolio on every device signed in to the same Google account: one
 * file in the app's hidden Drive folder, merged with what changed here.
 */
function SyncCard({ drive }: { drive: DriveSync }) {
  const [confirmOff, setConfirmOff] = useState(false)
  const { status, message, lastSyncAt } = drive
  const primary =
    'px-4 py-2 text-sm rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50'
  const secondary =
    'px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'

  if (status === 'unavailable') {
    return (
      <Card title="Synchronisation Google Drive">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Pas encore disponible dans cette version : l'identifiant Google de
          l'application n'est pas configuré. En attendant, utilise la
          sauvegarde ci-dessous pour passer d'un appareil à l'autre.
        </p>
      </Card>
    )
  }

  const state: Record<Exclude<typeof status, 'unavailable'>, string> = {
    off: 'Désactivée.',
    'signed-out': `Activée, en attente de connexion. Dernière synchro ${formatSyncTime(lastSyncAt)}.`,
    syncing: 'Synchronisation en cours…',
    synced: drive.pending
      ? `Des modifications ne sont pas encore sur Drive. Dernière synchro ${formatSyncTime(lastSyncAt)}.`
      : `À jour : dernière synchro ${formatSyncTime(lastSyncAt)}.`,
    error: `Dernière synchro réussie ${formatSyncTime(lastSyncAt)}.`,
  }

  return (
    <Card
      title="Synchronisation Google Drive"
      aside={
        status !== 'off' && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              status === 'synced'
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                : status === 'error'
                  ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            {status === 'synced' ? 'connectée' : status === 'error' ? 'erreur' : status === 'syncing' ? 'en cours' : 'déconnectée'}
          </span>
        )
      }
    >
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        Retrouve le même portefeuille sur chaque appareil connecté au même compte
        Google. L'application range un seul fichier dans un dossier « {FOLDER_NAME} »
        de ton Google Drive, et n'a accès qu'aux fichiers qu'elle a créés : rien
        d'autre de ton Drive. Ajouts, modifications et suppressions passent d'un
        appareil à l'autre : après chaque changement, l'application propose de
        l'envoyer, et un appareil vide se remplit depuis Drive à la connexion.
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{state[status]}</p>

      <div className="flex flex-wrap items-center gap-3">
        {status === 'off' ? (
          <button onClick={drive.connect} className={`${primary} inline-flex items-center gap-2`}>
            <DriveIcon />
            Activer avec Google Drive
          </button>
        ) : (
          <>
            <button onClick={drive.syncNow} disabled={status === 'syncing'} className={primary}>
              {status === 'signed-out' ? 'Se connecter et synchroniser' : 'Synchroniser maintenant'}
            </button>
            {confirmOff ? (
              <>
                <button
                  onClick={() => {
                    drive.disconnect(false)
                    setConfirmOff(false)
                  }}
                  className={secondary}
                >
                  Désactiver ici
                </button>
                {status === 'synced' && (
                  <button
                    onClick={() => {
                      drive.disconnect(true)
                      setConfirmOff(false)
                    }}
                    className="px-4 py-2 text-sm rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    Désactiver et mettre la copie Drive à la corbeille
                  </button>
                )}
                <button
                  onClick={() => setConfirmOff(false)}
                  className="px-3 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Annuler
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmOff(true)} className={secondary}>
                Désactiver
              </button>
            )}
          </>
        )}
      </div>
      {confirmOff && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Désactiver garde tes données sur cet appareil et la copie sur Drive ;
          les autres appareils continuent à se synchroniser entre eux.
        </p>
      )}

      {message && (
        <OutcomeBanner outcome={{ ok: false, warnings: [], message }} />
      )}
    </Card>
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
  exportBackup,
  restoreBackup,
  drive,
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
          Dépose un ou plusieurs relevés : le format et le compte sont reconnus
          au contenu du fichier (la liste est juste en dessous). Les lignes déjà
          enregistrées sont ignorées, donc ré-importer un fichier ne crée jamais
          de doublon.
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
              ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950'
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
            CSV DEGIRO, Ledger, Livret A · PDF Boursorama · plusieurs à la fois
          </span>
        </label>

        {outcome && (
          <div
            className={`mt-4 rounded-lg px-4 py-3 text-sm ${
              outcome.ok
                ? outcome.added
                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
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

      <SupportedData />

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
                {drive.status === 'off' || drive.status === 'unavailable'
                  ? "Effacer tout l'historique importé et repartir du fichier initial ?"
                  : 'Effacer ce navigateur ? La copie Google Drive reste intacte et pourra le remplir de nouveau : désactive d’abord la synchro pour repartir de zéro.'}
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

      <SyncCard drive={drive} />

      <BackupCard exportBackup={exportBackup} restoreBackup={restoreBackup} />

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

const NO_ROWS = new Set<number>()

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
  // Indices point into `transactions`: once it changes (an import, a
  // deletion elsewhere) they would address other rows, so the selection only
  // holds for the list it was made on.
  const [selection, setSelection] = useState<{ of: Transaction[]; rows: Set<number> }>(
    { of: transactions, rows: new Set() }
  )
  const selected = selection.of === transactions ? selection.rows : NO_ROWS
  const setSelected = (rows: Set<number>) => setSelection({ of: transactions, rows })
  const [confirming, setConfirming] = useState(false)

  const labelOf = useCallback(
    (tx: Transaction) =>
      tx.symbol || symbols[tx.isin]?.symbol || tx.isin || tx.productName,
    [symbols]
  )

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
  }, [rows, query, labelOf])

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
                            {SAVINGS_KINDS.includes(tx.account)
                              ? '—'
                              : formatMoney(tx.price, tx.currency)}
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

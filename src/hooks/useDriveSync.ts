import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BackupData } from '../utils/backup'
import { canonical, isEmptyData, mergeThreeWay, runSync } from '../utils/sync'
import {
  AuthError,
  GOOGLE_CLIENT_ID,
  authorize,
  driveStore,
  keepToken,
  revoke,
  savedToken,
  tokenValid,
  type DriveToken,
} from '../api/googleDrive'
import {
  clearSync,
  clearSyncBase,
  loadSyncBase,
  loadSyncSettings,
  saveSyncBase,
  saveSyncSettings,
  type SyncSettings,
} from '../utils/store'

export type SyncStatus =
  | 'unavailable' // no Google client id configured in this build
  | 'off'
  | 'signed-out' // enabled, but no valid token in this tab
  | 'syncing'
  | 'synced'
  | 'error'

/**
 * What the app offers to do, one click away:
 * - restore: this device holds nothing, the Drive copy can fill it;
 * - push: changes made here are not on Drive yet;
 * - pull: the page was opened without a Google session, other devices may
 *   have changed the copy.
 */
export type SyncPrompt = 'restore' | 'push' | 'pull'

const NOTHING: BackupData = { transactions: [], imports: [], symbols: {}, savings: null, loans: [] }

/**
 * The content that deserves a sync. Symbols are a cache of ISIN lookups: they
 * travel with every sync but never ask for one on their own, or resolving a
 * freshly pulled ISIN would ask to push right after the pull.
 */
const contentKey = (data: BackupData) => canonical({ ...data, symbols: {} })

const count = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/**
 * Google Drive sync, driven by usePortfolio: it receives the portfolio as a
 * backup and hands merged data back through `apply`, the same path as a
 * restored file. Nothing is sent without a click: after a change the app
 * offers to sync (`prompt`), since a Google sign-in popup can only open from
 * a click anyway. The access token lasts an hour and survives a reload of the
 * tab; the page then updates itself from Drive on opening.
 */
export function useDriveSync(
  data: BackupData,
  apply: (next: BackupData) => boolean,
  /** False while the portfolio is still being read at start. */
  ready: boolean
) {
  const [settings, setSettings] = useState<SyncSettings>(loadSyncSettings)
  const [token, setTokenState] = useState<DriveToken | null>(savedToken)
  const [phase, setPhase] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [baseKey, setBaseKey] = useState(() => contentKey(loadSyncBase() ?? NOTHING))
  const [syncedThisVisit, setSyncedThisVisit] = useState(false)
  // Content at which the user answered "later": asked again once it changes.
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)

  const setToken = useCallback((tok: DriveToken | null) => {
    setTokenState(tok)
    keepToken(tok)
  }, [])

  // The latest data, read when an await returns: the user may edit meanwhile.
  const dataRef = useRef(data)
  const applyRef = useRef(apply)
  useEffect(() => {
    dataRef.current = data
    applyRef.current = apply
  })
  const running = useRef(false)

  const sync = useCallback(
    async (tok: DriveToken) => {
      if (running.current) return
      running.current = true
      setPhase('syncing')
      setMessage(null)
      setNotice(null)
      try {
        const local = dataRef.current
        // An empty device takes the Drive copy as it is: read against an old
        // base, its emptiness would count as deleting everything.
        const restoring = isEmptyData(local)
        const result = await runSync(driveStore(tok), local, restoring ? null : loadSyncBase())
        // Edits made during the round trip are folded in, then sent next time.
        const now = dataRef.current
        const next =
          canonical(now) === canonical(local)
            ? result.merged
            : mergeThreeWay(local, now, result.merged)
        if (canonical(next) !== canonical(now) && !applyRef.current(next)) {
          throw new Error("Impossible d'enregistrer les données reçues (stockage du navigateur).")
        }
        saveSyncBase(result.merged)
        setBaseKey(contentKey(result.merged))
        const done = { enabled: true, lastSyncAt: new Date().toISOString() }
        saveSyncSettings(done)
        setSettings(done)
        setSyncedThisVisit(true)
        setPhase('idle')

        const { transactions, loans } = result.merged
        setNotice(
          restoring
            ? isEmptyData(result.merged)
              ? 'Ton Google Drive ne contient pas encore de portefeuille : importe tes relevés, ils y seront enregistrés.'
              : `Portefeuille récupéré depuis Google Drive : ${count(transactions.length, 'ligne')}${
                  loans.length ? ` et ${count(loans.length, 'emprunt')}` : ''
                }.`
            : result.localChanged && result.remoteChanged
              ? 'Synchronisé : changements envoyés et reçus.'
              : result.localChanged
                ? 'Mis à jour avec les changements de Google Drive.'
                : result.remoteChanged
                  ? 'Modifications enregistrées dans Google Drive.'
                  : 'Déjà à jour avec Google Drive.'
        )
      } catch (err) {
        if (err instanceof AuthError) {
          setToken(null)
          setPhase('idle')
          setMessage('Connexion Google expirée : reconnecte-toi pour synchroniser.')
        } else {
          setPhase('error')
          setMessage(err instanceof Error ? err.message : 'Synchronisation impossible.')
        }
      } finally {
        running.current = false
      }
    },
    [setToken]
  )

  /** Sign in (popup) then sync. Must run straight from a click. */
  const connect = useCallback(() => {
    if (!GOOGLE_CLIENT_ID) return
    setMessage(null)
    authorize(GOOGLE_CLIENT_ID)
      .then((tok) => {
        setToken(tok)
        const on = { ...loadSyncSettings(), enabled: true }
        saveSyncSettings(on)
        setSettings(on)
        return sync(tok)
      })
      .catch((err: Error) => {
        setPhase('error')
        setMessage(err.message)
      })
  }, [sync, setToken])

  const syncNow = useCallback(() => {
    if (tokenValid(token)) sync(token)
    else connect()
  }, [token, sync, connect])

  /** Stops syncing this device; the Drive copy is kept unless asked. */
  const disconnect = useCallback(
    async (deleteCopy: boolean) => {
      if (deleteCopy && tokenValid(token)) {
        try {
          await driveStore(token).remove()
        } catch (err) {
          setPhase('error')
          setMessage(err instanceof Error ? err.message : 'Suppression impossible.')
          return
        }
      }
      if (token) revoke(token)
      clearSync()
      setBaseKey(contentKey(NOTHING))
      setToken(null)
      setSettings(loadSyncSettings())
      setPhase('idle')
      setMessage(null)
      setNotice(null)
    },
    [token, setToken]
  )

  /** Called when the device is reset: the next sync fills it from Drive. */
  const forgetBase = useCallback(() => {
    clearSyncBase()
    setBaseKey(contentKey(NOTHING))
  }, [])

  const key = useMemo(() => contentKey(data), [data])
  const empty = isEmptyData(data)
  const pending = settings.enabled && !empty && key !== baseKey

  // Reopened within the hour (the token survived the reload): update from
  // Drive straight away, unless local changes wait for the user's answer.
  const autoPull = useRef(tokenValid(token))
  useEffect(() => {
    if (!ready || !autoPull.current) return
    autoPull.current = false
    if (settings.enabled && tokenValid(token) && !pending) sync(token)
  }, [ready, settings.enabled, token, pending, sync])

  // A notice is a confirmation, not something to act on.
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  let prompt: SyncPrompt | null = null
  if (GOOGLE_CLIENT_ID && ready && phase !== 'syncing' && key !== dismissedAt) {
    if (empty) prompt = 'restore'
    else if (pending) prompt = 'push'
    else if (settings.enabled && !syncedThisVisit && !tokenValid(token)) prompt = 'pull'
  }

  const status: SyncStatus = !GOOGLE_CLIENT_ID
    ? 'unavailable'
    : !settings.enabled
      ? 'off'
      : phase === 'syncing'
        ? 'syncing'
        : phase === 'error'
          ? 'error'
          : !tokenValid(token)
            ? 'signed-out'
            : 'synced'

  return {
    status,
    /** Local changes not on Drive yet. */
    pending,
    prompt,
    dismissPrompt: () => setDismissedAt(key),
    message,
    dismissMessage: () => setMessage(null),
    notice,
    dismissNotice: () => setNotice(null),
    lastSyncAt: settings.lastSyncAt,
    connect,
    syncNow,
    disconnect,
    forgetBase,
  }
}

export type DriveSync = ReturnType<typeof useDriveSync>

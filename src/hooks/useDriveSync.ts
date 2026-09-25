import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackupData } from '../utils/backup'
import { canonical, mergeThreeWay, runSync } from '../utils/sync'
import {
  AuthError,
  GOOGLE_CLIENT_ID,
  authorize,
  driveStore,
  revoke,
  tokenValid,
  type DriveToken,
} from '../api/googleDrive'
import {
  clearSync,
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

/** Quiet time after a change before it is sent, so a burst makes one write. */
const PUSH_DELAY_MS = 3000

const NOTHING: BackupData = { transactions: [], imports: [], symbols: {}, savings: null, loans: [] }

/**
 * Google Drive sync, driven by usePortfolio: it receives the portfolio as a
 * backup and hands merged data back through `apply`, the same path as a
 * restored file. The access token lives in memory only and lasts an hour;
 * after that, one click signs in again.
 */
export function useDriveSync(data: BackupData, apply: (next: BackupData) => boolean) {
  const [settings, setSettings] = useState<SyncSettings>(loadSyncSettings)
  const [token, setToken] = useState<DriveToken | null>(null)
  const [phase, setPhase] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  // The latest data, read when an await returns: the user may edit meanwhile.
  const dataRef = useRef(data)
  const applyRef = useRef(apply)
  useEffect(() => {
    dataRef.current = data
    applyRef.current = apply
  })
  const running = useRef(false)
  const baseKey = useRef<string | null>(null)

  const sync = useCallback(async (tok: DriveToken) => {
    if (running.current) return
    running.current = true
    setPhase('syncing')
    setMessage(null)
    try {
      const local = dataRef.current
      const result = await runSync(driveStore(tok), local, loadSyncBase())
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
      baseKey.current = canonical(result.merged)
      const done = { enabled: true, lastSyncAt: new Date().toISOString() }
      saveSyncSettings(done)
      setSettings(done)
      setPhase('idle')
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
  }, [])

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
  }, [sync])

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
      baseKey.current = null
      setToken(null)
      setSettings(loadSyncSettings())
      setPhase('idle')
      setMessage(null)
    },
    [token]
  )

  // Sends local changes a few seconds after the last one, while signed in.
  useEffect(() => {
    if (!settings.enabled || !tokenValid(token) || phase === 'syncing') return
    baseKey.current ??= canonical(loadSyncBase() ?? NOTHING)
    if (canonical(data) === baseKey.current) return
    const timer = setTimeout(() => {
      if (tokenValid(token)) sync(token)
      else setToken(null)
    }, PUSH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [data, settings.enabled, token, phase, sync])

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
    message,
    lastSyncAt: settings.lastSyncAt,
    connect,
    syncNow,
    disconnect,
  }
}

export type DriveSync = ReturnType<typeof useDriveSync>

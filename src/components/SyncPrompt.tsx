import type { ReactNode } from 'react'
import type { DriveSync, SyncPrompt as Prompt } from '../hooks/useDriveSync'
import { DriveIcon } from './DriveIcon'

const TEXT: Record<Prompt, { title: string; body: string; action: string }> = {
  restore: {
    title: 'Récupérer ton portefeuille ?',
    body: 'Rien sur cet appareil pour l’instant. Si tu utilises déjà Portefeuille ailleurs, tes données sont dans ton Google Drive.',
    action: 'Récupérer depuis Drive',
  },
  push: {
    title: 'Synchroniser avec Google Drive ?',
    body: 'Tes modifications ne sont que sur cet appareil. Envoie-les sur Drive pour les retrouver partout.',
    action: 'Synchroniser',
  },
  pull: {
    title: 'Mettre à jour depuis Google Drive ?',
    body: 'Récupère les changements faits sur tes autres appareils.',
    action: 'Mettre à jour',
  },
}

/**
 * The sync's voice, bottom right: it offers the next step (fill an empty
 * device, send changes, fetch those of other devices) and reports the
 * outcome. Nothing blocks the page; "later" waits for the next change.
 */
export function SyncPrompt({ drive }: { drive: DriveSync }) {
  const { status, prompt, message, notice } = drive

  const close = (onClick: () => void) => (
    <button
      onClick={onClick}
      aria-label="Fermer"
      className="-mr-1 -mt-1 px-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
    >
      ×
    </button>
  )
  const primary =
    'px-3 py-1.5 text-sm rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200'
  const secondary =
    'px-3 py-1.5 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'

  let content: ReactNode = null
  if (status === 'syncing') {
    content = (
      <p className="text-sm text-gray-700 dark:text-gray-300">Synchronisation avec Google Drive…</p>
    )
  } else if (message) {
    content = (
      <>
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm text-red-700 dark:text-red-300">{message}</p>
          {close(drive.dismissMessage)}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={drive.syncNow} className={primary}>
            Réessayer
          </button>
        </div>
      </>
    )
  } else if (notice) {
    content = (
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">{notice}</p>
        {close(drive.dismissNotice)}
      </div>
    )
  } else if (prompt) {
    const text = TEXT[prompt]
    content = (
      <>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{text.title}</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{text.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={drive.syncNow} className={primary}>
            {text.action}
          </button>
          <button onClick={drive.dismissPrompt} className={secondary}>
            {prompt === 'restore' && status === 'off' ? 'Non merci' : 'Plus tard'}
          </button>
        </div>
      </>
    )
  }
  if (!content) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-50 bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96 flex gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg"
    >
      <DriveIcon className={`w-5 h-5 shrink-0 mt-0.5 ${status === 'syncing' ? 'animate-pulse' : ''}`} />
      <div className="flex-1 min-w-0">{content}</div>
    </div>
  )
}

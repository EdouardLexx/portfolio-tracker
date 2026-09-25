import { ConflictError, type RemoteStore } from '../utils/sync'

/**
 * OAuth client of the Google Cloud project behind the sync. It is public by
 * design (a browser app cannot keep a secret). Empty: sync is not offered. A
 * fork should put the id of its own project here.
 */
export const GOOGLE_CLIENT_ID = ''

/** The hidden per-app folder only: the app sees nothing else of the Drive. */
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const FILE_NAME = 'portefeuille.json'
const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
/** Shared with public/oauth.html, which relays Google's answer. */
const CHANNEL = 'portefeuille-oauth'

export interface DriveToken {
  accessToken: string
  expiresAt: number
}

/** The token expired or was revoked: the user has to sign in again. */
export class AuthError extends Error {}

export const tokenValid = (token: DriveToken | null): token is DriveToken =>
  !!token && Date.now() < token.expiresAt

/** Where Google sends the user back, for every origin the app runs on. */
export function redirectUri(): string {
  return new URL('oauth.html', `${location.origin}${import.meta.env.BASE_URL}`).href
}

/**
 * Google sign-in in a popup, with the browser flow of OAuth (the token comes
 * back in the address of public/oauth.html): no Google script is loaded in
 * the app. Must be called straight from a click, or the popup is blocked.
 */
export function authorize(clientId: string): Promise<DriveToken> {
  const state = crypto.randomUUID()
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: 'token',
      scope: SCOPE,
      include_granted_scopes: 'true',
      state,
    })
  const popup = window.open(url, 'portefeuille-google', 'width=500,height=650')
  if (!popup) {
    return Promise.reject(
      new Error('Fenêtre de connexion bloquée : autorise les fenêtres pop-up pour ce site.')
    )
  }

  // A BroadcastChannel rather than window.opener: Google's pages cut the link
  // between the popup and the app, but both stay on the same origin.
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(CHANNEL)
    const timer = setTimeout(() => {
      channel.close()
      reject(new Error('Connexion Google abandonnée.'))
    }, 5 * 60_000)
    channel.onmessage = (event: MessageEvent<string>) => {
      const answer = new URLSearchParams(event.data)
      if (answer.get('state') !== state) return
      clearTimeout(timer)
      channel.close()
      const token = answer.get('access_token')
      if (!token) {
        reject(
          new Error(
            answer.get('error') === 'access_denied'
              ? 'Accès à Google Drive refusé.'
              : `Connexion Google impossible (${answer.get('error') ?? 'réponse inattendue'}).`
          )
        )
        return
      }
      // A minute of margin, so a sync never starts on a token about to expire.
      const seconds = Number(answer.get('expires_in')) || 3600
      resolve({ accessToken: token, expiresAt: Date.now() + (seconds - 60) * 1000 })
    }
  })
}

/** Best effort: the token dies within the hour anyway. */
export function revoke(token: DriveToken): void {
  fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: token.accessToken }),
  }).catch(() => {})
}

/** The synced copy: one JSON file in the app's hidden Drive folder. */
export function driveStore(token: DriveToken): RemoteStore & { remove(): Promise<void> } {
  async function api(url: string, init: RequestInit = {}): Promise<Response> {
    let res: Response
    try {
      res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token.accessToken}`, ...init.headers },
      })
    } catch {
      throw new Error('Google Drive injoignable : vérifie ta connexion internet.')
    }
    if (res.status === 401) throw new AuthError('Connexion Google expirée.')
    if (!res.ok) throw new Error(`Google Drive a refusé la demande (erreur ${res.status}).`)
    return res
  }

  async function find(): Promise<{ id: string; version: string } | null> {
    const query = new URLSearchParams({
      spaces: 'appDataFolder',
      q: `name = '${FILE_NAME}' and trashed = false`,
      fields: 'files(id,version)',
      pageSize: '1',
    })
    const { files } = (await (await api(`${FILES}?${query}`)).json()) as {
      files: { id: string; version: string }[]
    }
    return files[0] ?? null
  }

  return {
    async read() {
      const file = await find()
      if (!file) return null
      const text = await (await api(`${FILES}/${file.id}?alt=media`)).text()
      return { text, version: file.version }
    },

    async write(text, expectedVersion) {
      // Drive has no conditional write: checking the version just before
      // narrows the race with another device to a fraction of a second.
      const file = await find()
      if ((file?.version ?? null) !== expectedVersion) throw new ConflictError()
      if (file) {
        await api(`${UPLOAD}/${file.id}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: text,
        })
        return
      }
      const boundary = `portefeuille-${crypto.randomUUID()}`
      const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] })
      await api(`${UPLOAD}?uploadType=multipart`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body:
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`,
      })
    },

    async remove() {
      const file = await find()
      if (file) await api(`${FILES}/${file.id}`, { method: 'DELETE' })
    },
  }
}

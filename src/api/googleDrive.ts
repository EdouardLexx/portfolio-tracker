import { ConflictError, type RemoteStore } from '../utils/sync'

/**
 * OAuth client of the Google Cloud project behind the sync. It is public by
 * design (a browser app cannot keep a secret). Empty: sync is not offered. A
 * fork should put the id of its own project here.
 */
export const GOOGLE_CLIENT_ID =
  '1092908038784-obqc7r6g9ugtfvt9jhbafdiduodld7er.apps.googleusercontent.com'

/**
 * Only the files this app created: the user's own files stay invisible to it,
 * while the synced copy sits in a folder the user can see and download.
 */
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const FOLDER_NAME = 'Portfolio Manager'
const FILE_NAME = 'portefeuille.json'
const FOLDER_TYPE = 'application/vnd.google-apps.folder'
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

/**
 * The token survives a reload of the tab, not the tab itself: sessionStorage
 * is per tab and cleared when it closes.
 */
const TOKEN_KEY = 'portefeuille.driveToken'

export function savedToken(): DriveToken | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as DriveToken | null
    return t && typeof t.accessToken === 'string' && tokenValid(t) ? t : null
  } catch {
    return null
  }
}

export function keepToken(token: DriveToken | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token))
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* the token then lasts as long as the page */
  }
}

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

/** The synced copy: one JSON file in a "Portfolio Manager" folder of the Drive. */
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

  // With drive.file, a search only ever returns what this app created: a file
  // of the same name made by the user is never picked up, and the copy is
  // still found if the user moved it out of the folder.
  async function search(q: string): Promise<{ id: string; version: string }[]> {
    const query = new URLSearchParams({
      q: `${q} and trashed = false`,
      fields: 'files(id,version)',
      orderBy: 'modifiedTime desc',
      pageSize: '1',
    })
    return ((await (await api(`${FILES}?${query}`)).json()) as {
      files: { id: string; version: string }[]
    }).files
  }

  const find = async () =>
    (await search(`name = '${FILE_NAME}' and mimeType != '${FOLDER_TYPE}'`))[0] ?? null

  async function folderId(): Promise<string> {
    const [folder] = await search(`name = '${FOLDER_NAME}' and mimeType = '${FOLDER_TYPE}'`)
    if (folder) return folder.id
    const created = await api(FILES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_TYPE }),
    })
    return ((await created.json()) as { id: string }).id
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
      const metadata = JSON.stringify({ name: FILE_NAME, parents: [await folderId()] })
      await api(`${UPLOAD}?uploadType=multipart`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body:
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`,
      })
    },

    // To the bin, not deleted: recoverable for 30 days. The folder stays, as
    // the user may have put files of their own in it.
    async remove() {
      const file = await find()
      if (!file) return
      await api(`${FILES}/${file.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      })
    },
  }
}

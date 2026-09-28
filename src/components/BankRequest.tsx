import { useState } from 'react'
import { anonymizeCsv, type CsvSample } from '../utils/anonymize'

/** A fork should point to its own repository. */
const NEW_ISSUE_URL = 'https://github.com/EdouardLexx/portfolio-tracker/issues/new'
/** GitHub refuses longer addresses; the sample is cut to fit. */
const MAX_URL = 7500

const ACCOUNT_TYPES = [
  'Compte-titres (CTO)',
  'PEA',
  'Assurance-vie',
  'Crypto',
  'Livret / épargne',
  'Compte courant',
  'Autre',
]

const DELIMITERS: Record<string, string> = { ',': 'virgule', ';': 'point-virgule', '\t': 'tabulation' }

function issueBody(bank: string, account: string, sample: CsvSample, text: string, note: string) {
  const lines = text.trimEnd().split('\n')
  const codes = sample.codes.length
    ? sample.codes.map((c) => `- \`${c.column}\` : ${c.values.join(', ')}`).join('\n')
    : '_aucune colonne de codes repérée_'
  return `### Banque
${bank}

### Type de compte
${account}

### Fichier
CSV, séparateur ${DELIMITERS[sample.delimiter] ?? `« ${sample.delimiter} »`}, ${sample.rowCount} lignes, ${sample.columnCount} colonnes${sample.badEncoding ? ', encodage non UTF-8 (probablement Latin-1)' : ''}.

### Codes rencontrés dans tout le fichier
${codes}

### Extrait anonymisé (${Math.max(lines.length - 1, 0)} lignes)
\`\`\`csv
${lines.join('\n')}
\`\`\`
${note.trim() ? `\n### Commentaire\n${note.trim()}\n` : ''}
---
_Envoyé depuis la page Données de Portefeuille. Extrait anonymisé dans le navigateur et relu par l'expéditeur._`
}

/**
 * "My bank is missing": turns an export into an anonymised sample, shown and
 * editable, then opens a pre-filled GitHub issue. Nothing is sent by the app
 * itself; the person posts the issue from their own GitHub account.
 */
export function BankRequest() {
  const [open, setOpen] = useState(false)
  const [bank, setBank] = useState('')
  const [account, setAccount] = useState(ACCOUNT_TYPES[0])
  const [note, setNote] = useState('')
  const [sample, setSample] = useState<CsvSample | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cut, setCut] = useState<number | null>(null)

  const field =
    'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100'

  async function readFile(file: File | undefined) {
    setSample(null)
    setError(null)
    setCut(null)
    if (!file) return
    if (!/\.(csv|txt|tsv)$/i.test(file.name)) {
      setError('Seuls les fichiers CSV sont gérés ici. Pour un PDF, décris le document dans le commentaire.')
      return
    }
    const result = anonymizeCsv(await file.text())
    if ('error' in result) {
      setError(result.error)
      return
    }
    setSample(result)
    setText(result.text)
  }

  function send() {
    if (!sample) return
    // Drop sample rows from the end until the address is short enough.
    let lines = text.trimEnd().split('\n')
    const build = () =>
      `${NEW_ISSUE_URL}?${new URLSearchParams({
        title: `[Nouvelle banque] ${bank.trim()} — ${account}`,
        body: issueBody(bank.trim(), account, sample, lines.join('\n'), note),
      })}`
    let url = build()
    while (url.length > MAX_URL && lines.length > 3) {
      lines = lines.slice(0, -1)
      url = build()
    }
    setCut(lines.length < text.trimEnd().split('\n').length ? lines.length - 1 : null)
    window.open(url, '_blank', 'noopener')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        Ta banque n'est pas dans la liste ? Demander son ajout
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Demander l'ajout d'une banque
        </h4>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Choisis un export de ta banque : l'application en tire un court extrait{' '}
          <strong className="font-medium text-gray-700 dark:text-gray-300">anonymisé ici même</strong>{' '}
          (noms, IBAN, montants, références et libellés remplacés), que tu relis
          avant de l'envoyer. La demande s'ouvre sur GitHub, où elle sera{' '}
          <strong className="font-medium text-gray-700 dark:text-gray-300">publique</strong>{' '}
          (il faut un compte GitHub).
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
          <span>Banque ou courtier</span>
          <input
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            placeholder="ex. Fortuneo"
            className={field}
          />
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
          <span>Type de compte</span>
          <select value={account} onChange={(e) => setAccount(e.target.value)} className={field}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm text-gray-700 dark:text-gray-300 space-y-1">
        <span>Export CSV de la banque</span>
        <input
          type="file"
          accept=".csv,.txt,.tsv,text/csv"
          onChange={(e) => readFile(e.target.files?.[0])}
          className="block text-sm text-gray-600 dark:text-gray-400"
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {sample && (
        <>
          <div className="space-y-1">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Extrait anonymisé : {sample.sampleRows} lignes sur {sample.rowCount}.{' '}
              <span className="text-amber-700 dark:text-amber-400">
                Vérifie qu'il ne reste ni nom, ni numéro de compte, ni rien de personnel ;
                tu peux corriger directement.
              </span>
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              spellCheck={false}
              className={`${field} font-mono text-xs whitespace-pre`}
            />
          </div>
          <label className="block text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <span>Commentaire (facultatif)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="ex. export fait depuis l'appli mobile, menu Relevés"
              className={field}
            />
          </label>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={send}
          disabled={!sample || !bank.trim()}
          className="px-4 py-2 text-sm rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
        >
          Ouvrir la demande sur GitHub
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Annuler
        </button>
        {cut !== null && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Extrait réduit à {cut} lignes pour tenir dans le lien.
          </span>
        )}
      </div>
    </div>
  )
}

import type { ImportRecord, Loan, Transaction } from '../types'
import { mergeBackup, parseBackup, createBackup, type BackupData } from './backup'
import { sortTransactionsDesc } from '../parsers/shared'

/**
 * Where the synced copy lives. The real one is Google Drive
 * (`src/api/googleDrive.ts`); tests use an in-memory one.
 */
export interface RemoteStore {
  /** The stored text and a version that changes on every write, or null. */
  read(): Promise<{ text: string; version: string } | null>
  /** Writes the text; fails if the copy changed since `expectedVersion`. */
  write(text: string, expectedVersion: string | null): Promise<void>
}

const stable = (value: unknown): string =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  )

/** One string per content, whatever the order of lines or keys. */
export function canonical(data: BackupData): string {
  return stable({
    transactions: data.transactions.map(stable).sort(),
    imports: data.imports.map(stable).sort(),
    symbols: data.symbols,
    savings: data.savings,
    loans: data.loans.map(stable).sort(),
  })
}

export const sameData = (a: BackupData, b: BackupData) => canonical(a) === canonical(b)

/** Nothing the user entered: a new device, or one just reset. */
export const isEmptyData = (data: BackupData) =>
  !data.transactions.length && !data.imports.length && !data.loans.length && !data.savings

function countById(list: Transaction[]) {
  const map = new Map<string, Transaction[]>()
  for (const tx of list) map.set(tx.id, [...(map.get(tx.id) ?? []), tx])
  return map
}

/**
 * Transactions are counted per id, as the import deduplication does: split
 * fills share an id. For each id, the result starts from the common count,
 * keeps the larger addition and the larger removal of the two sides. A line
 * imported on both devices is therefore kept once, and a line deleted on
 * either side goes away on both.
 */
function mergeTransactions3(base: Transaction[], local: Transaction[], remote: Transaction[]) {
  const [b, l, r] = [countById(base), countById(local), countById(remote)]
  const merged: Transaction[] = []
  for (const id of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
    const nb = b.get(id)?.length ?? 0
    const nl = l.get(id)?.length ?? 0
    const nr = r.get(id)?.length ?? 0
    const count = Math.max(
      0,
      nb + Math.max(nl - nb, nr - nb, 0) - Math.max(nb - nl, nb - nr, 0)
    )
    const pool = [...(l.get(id) ?? []), ...(r.get(id) ?? []), ...(b.get(id) ?? [])]
    merged.push(...pool.slice(0, count))
  }
  return sortTransactionsDesc(merged)
}

/**
 * Items with an id and editable content (loans, import records). The side
 * that changed an item wins; an edit beats a deletion, so a loan corrected on
 * one device is not lost because the other one removed it meanwhile.
 */
function mergeById<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
  const [b, l, r] = [base, local, remote].map((list) => new Map(list.map((x) => [x.id, x])))
  const result: T[] = []
  for (const id of new Set([...l.keys(), ...r.keys(), ...b.keys()])) {
    const [xb, xl, xr] = [b.get(id), l.get(id), r.get(id)]
    const changed = (x: T | undefined) => stable(x) !== stable(xb)
    if (!xb) {
      const added = xl ?? xr
      if (added) result.push(added)
    } else if (xl && xr) {
      result.push(changed(xl) ? xl : xr)
    } else if (xl && changed(xl)) {
      result.push(xl)
    } else if (xr && changed(xr)) {
      result.push(xr)
    }
    // Otherwise it was deleted on one side and left alone on the other.
  }
  return result
}

/**
 * Combines what changed on this device and on the synced copy since they last
 * agreed (`base`). Without a base (first sync of a device, or after a reset)
 * nothing can be told apart from a deletion, so everything is kept.
 */
export function mergeThreeWay(
  base: BackupData | null,
  local: BackupData,
  remote: BackupData
): BackupData {
  if (!base) return mergeBackup(local, remote).data
  const pick = <T>(b: T, l: T, r: T) => (stable(l) !== stable(b) ? l : r)
  return {
    transactions: mergeTransactions3(base.transactions, local.transactions, remote.transactions),
    imports: mergeById<ImportRecord>(base.imports, local.imports, remote.imports).sort((x, y) =>
      y.importedAt.localeCompare(x.importedAt)
    ),
    symbols: { ...remote.symbols, ...local.symbols },
    savings: pick(base.savings, local.savings, remote.savings),
    loans: mergeById<Loan>(base.loans, local.loans, remote.loans),
  }
}

export interface SyncResult {
  /** What both sides now hold: the next base. */
  merged: BackupData
  /** True when this device must take `merged` in. */
  localChanged: boolean
  /** True when the synced copy was written. */
  remoteChanged: boolean
}

/**
 * One synchronisation: read the copy, merge, write it back if it moved. A
 * write refused because another device wrote meanwhile starts over, so no
 * change is lost to a race. Nothing local is touched here: the caller
 * applies `merged` only once the copy is safely written.
 */
export async function runSync(
  store: RemoteStore,
  local: BackupData,
  base: BackupData | null,
  attempts = 3
): Promise<SyncResult> {
  for (let attempt = 1; ; attempt++) {
    const copy = await store.read()
    let remote: BackupData | null = null
    if (copy) {
      const parsed = parseBackup(copy.text)
      if ('error' in parsed) {
        throw new Error(`Copie Google Drive illisible : ${parsed.error}`)
      }
      remote = parsed.backup.data
    }

    const merged = remote ? mergeThreeWay(base, local, remote) : local
    const remoteChanged = !remote || !sameData(merged, remote)
    try {
      if (remoteChanged) {
        await store.write(JSON.stringify(createBackup(merged)), copy?.version ?? null)
      }
    } catch (err) {
      if (err instanceof ConflictError && attempt < attempts) continue
      throw err
    }
    return { merged, localChanged: !sameData(merged, local), remoteChanged }
  }
}

/** The copy changed between reading and writing it. */
export class ConflictError extends Error {}

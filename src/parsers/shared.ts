import type { Transaction } from '../types'

/** "1 234,56" / "1.234,56" / "217,37" → number. Returns 0 for blanks. */
export function parseFrenchNumber(value: string | null | undefined): number {
  if (!value) return 0
  const cleaned = value
    .replace(/\s/g, '')
    .replace(/ /g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

/**
 * Stable identity for one execution line. Brokers split a single order into
 * several identical fills, so the content — not just the order reference —
 * takes part in the key; occurrences are then counted at merge time.
 */
export function makeTransactionId(parts: {
  account: string
  orderRef: string
  date: string
  time: string
  isin: string
  quantity: number
  price: number
  amountEUR: number
}): string {
  return [
    parts.account,
    parts.orderRef,
    parts.date,
    parts.time,
    parts.isin,
    parts.quantity,
    parts.price.toFixed(4),
    parts.amountEUR.toFixed(2),
  ].join('|')
}

export function sortTransactionsDesc(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) =>
    `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
  )
}

/**
 * Merges by occurrence count rather than presence: re-importing a cumulative
 * export adds nothing, a partial export adds only what is new, and genuine
 * repeated fills of one order survive.
 */
export function mergeTransactions(
  existing: Transaction[],
  incoming: Transaction[]
): { merged: Transaction[]; added: number; duplicates: number } {
  const groupById = (list: Transaction[]) => {
    const map = new Map<string, Transaction[]>()
    for (const tx of list) {
      const bucket = map.get(tx.id)
      if (bucket) bucket.push(tx)
      else map.set(tx.id, [tx])
    }
    return map
  }

  const before = groupById(existing)
  const after = groupById(incoming)

  const merged: Transaction[] = []
  let added = 0
  let duplicates = 0

  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(id) ?? []
    const fresh = after.get(id) ?? []

    duplicates += Math.min(old.length, fresh.length)

    if (fresh.length > old.length) {
      merged.push(...old, ...fresh.slice(old.length))
      added += fresh.length - old.length
    } else {
      merged.push(...old)
    }
  }

  return { merged: sortTransactionsDesc(merged), added, duplicates }
}

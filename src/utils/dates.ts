const pad = (n: number) => String(n).padStart(2, '0')

/** Calendar day in the user's time zone, as YYYY-MM-DD. */
export function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today where the user is: `toISOString` gives yesterday before 2 a.m. in France. */
export function localToday(): string {
  return toLocalISODate(new Date())
}

/** "à 14:32", or "le 3 oct. à 14:32" when it was not today. */
export function formatSyncTime(iso: string | null): string {
  if (!iso) return 'jamais'
  const d = new Date(iso)
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString()
    ? `à ${time}`
    : `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${time}`
}

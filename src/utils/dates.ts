const pad = (n: number) => String(n).padStart(2, '0')

/** Calendar day in the user's time zone, as YYYY-MM-DD. */
export function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today where the user is: `toISOString` gives yesterday before 2 a.m. in France. */
export function localToday(): string {
  return toLocalISODate(new Date())
}

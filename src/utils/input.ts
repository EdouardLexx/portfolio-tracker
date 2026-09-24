/**
 * A number typed in a form: "1 234,56", "1.234,56", "1234.56" or "-50".
 * NaN when unreadable. A bare `parseFloat` would read "1 200" as 1 and
 * "1.200,50" as 1.2, silently storing the wrong amount.
 */
export function parseDecimalInput(input: string): number {
  const compact = input.replace(/[\s  ]/g, '')
  // With a comma, it is the decimal mark and any dot groups thousands.
  const normalised = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalised) ? Number(normalised) : NaN
}

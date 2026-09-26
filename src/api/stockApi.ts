import type {
  StockQuote,
  HistoricalPrice,
  SymbolInfo,
  ChartRange,
  InstrumentChart,
  InstrumentInfo,
} from '../types'

/**
 * The local server by default. The online version (GitHub Pages) has no
 * server of its own: its build points this at the quotes relay.
 */
const BASE: string = import.meta.env.VITE_API_BASE ?? '/api'
const ONLINE = BASE !== '/api'

const SERVER_DOWN = ONLINE
  ? 'Relais des cours injoignable : vérifie ta connexion internet, puis recharge la page.'
  : "Serveur local injoignable : l'application a été fermée ou arrêtée. Relance-la, puis recharge la page."

/**
 * GET on the API. A rejected fetch (not an HTTP error) means the server
 * itself is gone, which the browser reports in English and in jargon
 * ("NetworkError when attempting to fetch resource", "Failed to fetch").
 */
async function getJson<T>(path: string, params: Record<string, string>, failure: string): Promise<T> {
  const query = new URLSearchParams(params).toString()
  let res: Response
  try {
    res = await fetch(`${BASE}/${path}${query ? `?${query}` : ''}`)
  } catch {
    throw new Error(SERVER_DOWN)
  }
  if (!res.ok) throw new Error(failure)
  return res.json()
}

export async function resolveIsins(
  isins: string[],
  names: Record<string, string> = {}
): Promise<SymbolInfo[]> {
  if (!isins.length) return []
  return getJson(
    'resolve',
    { isins: isins.join(','), names: JSON.stringify(names) },
    'Résolution des ISIN impossible'
  )
}

export function fetchInstrument(symbol: string): Promise<InstrumentInfo> {
  return getJson('instrument', { symbol }, `Cours indisponible pour ${symbol}`)
}

export function fetchChart(symbol: string, range: ChartRange): Promise<InstrumentChart> {
  return getJson('chart', { symbol, range }, `Graphique indisponible pour ${symbol}`)
}

export async function fetchQuotes(symbols: string[]): Promise<StockQuote[]> {
  if (!symbols.length) return []
  return getJson('quotes', { symbols: symbols.join(',') }, 'Récupération des cours impossible')
}

export function fetchHistory(symbol: string, from?: string): Promise<HistoricalPrice[]> {
  return getJson(
    'history',
    from ? { symbol, from } : { symbol },
    `Historique indisponible pour ${symbol}`
  )
}

export function fetchFxRates(currencies: string[]): Promise<Record<string, number>> {
  return getJson(
    'fx',
    { currencies: currencies.join(',') },
    'Récupération des taux de change impossible'
  )
}

export function fetchLivretARate(): Promise<{ rate: number; since: string }> {
  return getJson('livret-a', {}, 'Taux du Livret A indisponible')
}

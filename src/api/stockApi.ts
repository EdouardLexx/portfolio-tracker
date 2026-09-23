import type {
  StockQuote,
  HistoricalPrice,
  SymbolInfo,
} from '../types'

const BASE = '/api'

export async function resolveIsins(
  isins: string[],
  names: Record<string, string> = {}
): Promise<SymbolInfo[]> {
  if (!isins.length) return []
  const params = new URLSearchParams({
    isins: isins.join(','),
    names: JSON.stringify(names),
  })
  const res = await fetch(`${BASE}/resolve?${params}`)
  if (!res.ok) throw new Error('Résolution des ISIN impossible')
  return res.json()
}

export async function fetchQuotes(symbols: string[]): Promise<StockQuote[]> {
  if (!symbols.length) return []
  const res = await fetch(`${BASE}/quotes?symbols=${symbols.join(',')}`)
  if (!res.ok) throw new Error('Récupération des cours impossible')
  return res.json()
}

export async function fetchHistory(
  symbol: string,
  from?: string
): Promise<HistoricalPrice[]> {
  const params = new URLSearchParams({ symbol })
  if (from) params.set('from', from)
  const res = await fetch(`${BASE}/history?${params}`)
  if (!res.ok) throw new Error(`Historique indisponible pour ${symbol}`)
  return res.json()
}


export async function fetchFxRates(
  currencies: string[]
): Promise<Record<string, number>> {
  const res = await fetch(`${BASE}/fx?currencies=${currencies.join(',')}`)
  if (!res.ok) throw new Error('Récupération des taux de change impossible')
  return res.json()
}

export async function fetchLivretARate(): Promise<{
  rate: number
  since: string
}> {
  const res = await fetch(`${BASE}/livret-a`)
  if (!res.ok) throw new Error('Taux du Livret A indisponible')
  return res.json()
}

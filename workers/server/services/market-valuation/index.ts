import type { MarketValuation, MarketValuationSeries, ValuationPoint } from '../../../../app/features/market-valuation/types'
import { createCache } from '../../cache'

const CACHE_TTL_SECONDS = 6 * 60 * 60
const SOURCE_URL = 'https://historyofmarket.com'

type HistoryOfMarketPayload = {
    updated?: string
    current?: { forward?: number }
    forward?: Array<{ date?: string; value?: number }>
}

type MarketDefinition = {
    id: MarketValuationSeries['id']
    name: string
    path: string
}

const MARKETS: MarketDefinition[] = [
    { id: 'ndx', name: '纳斯达克100', path: '/api/ndx/forward-pe.json' },
    { id: 'sp500', name: '标普500', path: '/api/sp500/forward-pe.json' },
]

const cache = createCache('market-valuation:history-of-market')

function normalizeSeries(definition: MarketDefinition, payload: HistoryOfMarketPayload): MarketValuationSeries {
    const points = (payload.forward || [])
        .map((point): ValuationPoint | null => {
            const value = Number(point.value)
            if (!point.date || !Number.isFinite(value) || value <= 0) return null
            return { date: point.date, value }
        })
        .filter((point): point is ValuationPoint => point !== null)

    if (points.length === 0) throw new Error(`EMPTY_VALUATION_${definition.id.toUpperCase()}`)

    const latest = points[points.length - 1]
    return {
        id: definition.id,
        name: definition.name,
        points,
        current: Number.isFinite(Number(payload.current?.forward)) ? Number(payload.current?.forward) : latest.value,
        updated: payload.updated || latest.date,
    }
}

async function fetchMarket(definition: MarketDefinition): Promise<MarketValuationSeries> {
    const response = await fetch(`${SOURCE_URL}${definition.path}`, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'stock-record/market-valuation',
        },
    })
    if (!response.ok) throw new Error(`HISTORY_OF_MARKET_${response.status}`)
    return normalizeSeries(definition, (await response.json()) as HistoryOfMarketPayload)
}

export function getMarketValuationService() {
    return {
        getValuation(): Promise<MarketValuation> {
            return cache.wrap(
                ['forward-pe', 'v1'],
                { ttlSeconds: CACHE_TTL_SECONDS, shouldCache: (value) => value.series.every((series) => series.points.length > 0) },
                async () => {
                    const series = await Promise.all(MARKETS.map(fetchMarket))
                    return {
                        updated: series.map((item) => item.updated).sort().at(-1) || new Date().toISOString().slice(0, 10),
                        source: SOURCE_URL,
                        series: series as MarketValuation['series'],
                    }
                },
            )
        },
    }
}

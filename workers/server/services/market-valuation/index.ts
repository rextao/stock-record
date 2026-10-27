import type { MarketValuation, MarketValuationSeries, ValuationPoint } from '../../../../app/features/market-valuation/types'
import { createCache } from '../../cache'

const CACHE_TTL_SECONDS = 6 * 60 * 60
const SOURCE_URL = 'https://historyofmarket.com'

type HistoryOfMarketPayload = {
    updated?: string
    current?: { forward?: number }
    forward?: Array<{ date?: string; value?: number }>
    forwardOwn?: Array<{ date?: string; value?: number }>
}

type SectorHistoryOfMarketPayload = {
    updated?: string
    sectors?: {
        sox?: {
            series?: Array<{ date?: string; value?: number }>
            forwardOwn?: Array<{ date?: string; value?: number }>
            forwardOwnLatest?: { date?: string; value?: number }
        }
    }
}

type MarketDefinition = {
    id: MarketValuationSeries['id']
    name: string
    path: string
    sectorKey?: 'sox'
}

const MARKETS: MarketDefinition[] = [
    { id: 'sp500', name: '标普 500 Forward P/E', path: '/api/sp500/forward-pe.json' },
    { id: 'ndx', name: '纳指100 Forward P/E', path: '/api/ndx/forward-pe.json' },
    { id: 'soxx', name: 'SOXX Forward P/E', path: '/api/sectors/forward-pe.json', sectorKey: 'sox' },
]

const cache = createCache('market-valuation:history-of-market')

function normalizeSeries(definition: MarketDefinition, payload: HistoryOfMarketPayload | SectorHistoryOfMarketPayload): MarketValuationSeries {
    const sector = definition.sectorKey ? (payload as SectorHistoryOfMarketPayload).sectors?.[definition.sectorKey] : null
    const forward = sector?.series || (payload as HistoryOfMarketPayload).forward || []
    const points = forward
        .map((point): ValuationPoint | null => {
            const value = Number(point.value)
            if (!point.date || !Number.isFinite(value) || value <= 0) return null
            return { date: point.date, value }
        })
        .filter((point): point is ValuationPoint => point !== null)

    if (points.length === 0) throw new Error(`EMPTY_VALUATION_${definition.id.toUpperCase()}`)

    const latest = points[points.length - 1]
    const ownPoints = (sector?.forwardOwn || (payload as HistoryOfMarketPayload).forwardOwn || [])
        .map((point) => ({ date: point.date || '', value: Number(point.value) }))
        .filter((point) => point.date && Number.isFinite(point.value) && point.value > 0)
    const latestOwn = ownPoints[ownPoints.length - 1]
    return {
        id: definition.id,
        name: definition.name,
        points,
        current: latestOwn?.value ?? (Number.isFinite(Number((payload as HistoryOfMarketPayload).current?.forward)) ? Number((payload as HistoryOfMarketPayload).current?.forward) : latest.value),
        currentDate: latestOwn?.date || sector?.forwardOwnLatest?.date || payload.updated || latest.date,
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
                        series,
                    }
                },
            )
        },
    }
}

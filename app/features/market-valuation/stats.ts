import type { MarketValuationSeries } from './types'

export type ValuationStats = {
    current: number
    average: number
    deviation: number
    lower: number
    upper: number
    min: number
    max: number
    points: MarketValuationSeries['points']
}

function dateValue(date: string) {
    return Date.parse(`${date}T00:00:00Z`)
}

export function getValuationStats(series: MarketValuationSeries, rangeYears: number | null = 10): ValuationStats {
    const latestDate = series.points[series.points.length - 1]?.date || series.updated
    const cutoff = rangeYears == null ? Number.NEGATIVE_INFINITY : dateValue(latestDate) - rangeYears * 365.25 * 86_400_000
    const points = series.points.filter((point) => dateValue(point.date) >= cutoff)
    const values = points.map((point) => point.value)
    const current = series.current ?? values[values.length - 1] ?? 0
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : current
    const variance = values.length
        ? values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length
        : 0
    const deviation = Math.sqrt(variance)

    return {
        current,
        average,
        deviation,
        lower: Math.max(0, average - deviation),
        upper: average + deviation,
        min: Math.min(...values, current),
        max: Math.max(...values, current),
        points,
    }
}

export function getValuationStatus(stats: ValuationStats): '高估' | '低估' | '合理' {
    if (stats.current > stats.upper) return '高估'
    if (stats.current < stats.lower) return '低估'
    return '合理'
}

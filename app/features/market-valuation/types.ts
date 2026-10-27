export type ValuationPoint = {
    date: string
    value: number
}

export type MarketValuationSeries = {
    id: 'ndx' | 'sp500'
    name: string
    points: ValuationPoint[]
    current: number | null
    currentDate: string
    updated: string
}

export type MarketValuation = {
    updated: string
    source: string
    series: [MarketValuationSeries, MarketValuationSeries]
}

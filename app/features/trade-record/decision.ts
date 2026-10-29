import type { PriceCandle } from '../stock-chart/types'

export type DecisionLevel = '日线' | '周线' | '月线'

export type AdjustmentDecision = {
    level: DecisionLevel
    drawdown: number | null
    durationDays: number | null
    durationMonths: number | null
    drawdownThreshold: number
    durationThreshold: number
    durationUnit: '天' | '周' | '月'
    durationLabel: string
    passedByDrawdown: boolean
    passedByDuration: boolean
    passed: boolean
    peakDate: string | null
    troughDate: string | null
    insufficient: boolean
}

type PeriodPoint = {
    date: string
    high: number
    low: number
    highDate: string
    lowDate: string
}

const parseDate = (date: string) => Date.parse(`${date}T00:00:00Z`)

function dayDifference(from: string, to: string): number {
    return Math.max(0, Math.round((parseDate(to) - parseDate(from)) / 86_400_000))
}

function monthIndex(date: string): number {
    const [year, month] = date.split('-').map(Number)
    return year * 12 + month - 1
}

function pointFromCandle(candle: PriceCandle): PeriodPoint {
    return {
        date: candle.date,
        high: candle.h ?? candle.close,
        low: candle.l ?? candle.close,
        highDate: candle.date,
        lowDate: candle.date,
    }
}

function mergePoint(target: PeriodPoint, candle: PriceCandle): void {
    const high = candle.h ?? candle.close
    const low = candle.l ?? candle.close
    if (high >= target.high) {
        target.high = high
        target.highDate = candle.date
    }
    if (low <= target.low) {
        target.low = low
        target.lowDate = candle.date
    }
    target.date = candle.date
}

function aggregate(candles: PriceCandle[], level: DecisionLevel): PeriodPoint[] {
    if (level === '日线') return candles.map(pointFromCandle)

    const groups = new Map<string, PeriodPoint>()
    for (const candle of candles) {
        const date = new Date(parseDate(candle.date))
        let key: string
        if (level === '月线') {
            key = candle.date.slice(0, 7)
        } else {
            const day = date.getUTCDay() || 7
            date.setUTCDate(date.getUTCDate() - day + 1)
            key = date.toISOString().slice(0, 10)
        }
        const existing = groups.get(key)
        if (existing) mergePoint(existing, candle)
        else groups.set(key, pointFromCandle(candle))
    }
    return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function findLargestAdjustment(points: PeriodPoint[]): { peak: PeriodPoint; trough: PeriodPoint } | null {
    if (points.length < 2) return null

    let best: { peak: PeriodPoint; trough: PeriodPoint; drawdown: number } | null = null
    for (let peakIndex = 0; peakIndex < points.length - 1; peakIndex += 1) {
        const peak = points[peakIndex]
        let trough = points[peakIndex + 1]
        for (let troughIndex = peakIndex + 2; troughIndex < points.length; troughIndex += 1) {
            if (points[troughIndex].low < trough.low) trough = points[troughIndex]
        }
        if (peak.high <= 0) continue
        const drawdown = ((peak.high - trough.low) / peak.high) * 100
        if (!best || drawdown > best.drawdown) best = { peak, trough, drawdown }
    }
    return best ? { peak: best.peak, trough: best.trough } : null
}

export function evaluateAdjustment(candles: PriceCandle[], level: DecisionLevel): AdjustmentDecision {
    const config = {
        日线: { drawdownThreshold: 5, durationThreshold: 14, durationUnit: '天' as const, durationLabel: '2周' },
        周线: { drawdownThreshold: 10, durationThreshold: 28, durationUnit: '周' as const, durationLabel: '4周' },
        月线: { drawdownThreshold: 15, durationThreshold: 4, durationUnit: '月' as const, durationLabel: '4个月' },
    }[level]
    const adjustment = findLargestAdjustment(aggregate(candles, level))

    if (!adjustment) {
        return {
            level,
            drawdown: null,
            durationDays: null,
            durationMonths: null,
            ...config,
            passedByDrawdown: false,
            passedByDuration: false,
            passed: false,
            peakDate: null,
            troughDate: null,
            insufficient: true,
        }
    }

    const durationDays = dayDifference(adjustment.peak.highDate, adjustment.trough.lowDate)
    const durationMonths = Math.max(0, monthIndex(adjustment.trough.lowDate) - monthIndex(adjustment.peak.highDate))
    const passedByDrawdown = ((adjustment.peak.high - adjustment.trough.low) / adjustment.peak.high) * 100 >= config.drawdownThreshold
    const passedByDuration = config.durationUnit === '月'
        ? durationMonths >= config.durationThreshold
        : durationDays >= config.durationThreshold

    return {
        level,
        drawdown: ((adjustment.peak.high - adjustment.trough.low) / adjustment.peak.high) * 100,
        durationDays,
        durationMonths,
        ...config,
        passedByDrawdown,
        passedByDuration,
        passed: passedByDrawdown || passedByDuration,
        peakDate: adjustment.peak.highDate,
        troughDate: adjustment.trough.lowDate,
        insufficient: false,
    }
}

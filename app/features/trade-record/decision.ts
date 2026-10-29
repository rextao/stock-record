import type { PriceCandle } from '../stock-chart/types'

export type DecisionLevel = '日线' | '周线' | '月线'

/** 「当前这轮调整」= 窗口内最高点 → 最新收盘价 / 最新交易日，不回看历史最低点 */
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
    peakPrice: number | null
    insufficient: boolean
}

type PeriodPoint = {
    date: string
    close: number
    high: number
    highDate: string
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
        close: candle.close,
        high: candle.h ?? candle.close,
        highDate: candle.date,
    }
}

function mergePoint(target: PeriodPoint, candle: PriceCandle): void {
    const high = candle.h ?? candle.close
    if (high >= target.high) {
        target.high = high
        target.highDate = candle.date
    }
    target.close = candle.close
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

export function evaluateAdjustment(candles: PriceCandle[], level: DecisionLevel): AdjustmentDecision {
    const config = {
        日线: { drawdownThreshold: 5, durationThreshold: 14, durationUnit: '天' as const, durationLabel: '2周' },
        周线: { drawdownThreshold: 10, durationThreshold: 28, durationUnit: '周' as const, durationLabel: '4周' },
        月线: { drawdownThreshold: 15, durationThreshold: 4, durationUnit: '月' as const, durationLabel: '4个月' },
    }[level]

    const fail = (): AdjustmentDecision => ({
        level,
        drawdown: null,
        durationDays: null,
        durationMonths: null,
        ...config,
        passedByDrawdown: false,
        passedByDuration: false,
        passed: false,
        peakDate: null,
        peakPrice: null,
        insufficient: true,
    })

    const points = aggregate(candles, level)
    if (points.length < 2) return fail()

    const peak = points.reduce((best, point) => (point.high > best.high ? point : best))
    const latest = points[points.length - 1]
    if (peak.high <= 0) return fail()

    const drawdown = ((peak.high - latest.close) / peak.high) * 100
    const durationDays = dayDifference(peak.highDate, latest.date)
    const durationMonths = Math.max(0, monthIndex(latest.date) - monthIndex(peak.highDate))
    const passedByDrawdown = drawdown >= config.drawdownThreshold
    const passedByDuration = config.durationUnit === '月'
        ? durationMonths >= config.durationThreshold
        : durationDays >= config.durationThreshold

    return {
        level,
        drawdown,
        durationDays,
        durationMonths,
        ...config,
        passedByDrawdown,
        passedByDuration,
        passed: passedByDrawdown || passedByDuration,
        peakDate: peak.highDate,
        peakPrice: peak.high,
        insufficient: false,
    }
}

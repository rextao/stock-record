import { useMemo } from 'react'
import { readToken, useThemeStore } from '~/common/theme/themeStore'
import type { MarketValuationSeries, ValuationPoint } from './types'
import styles from './ValuationCurveChart.module.less'

type Props = {
    series: MarketValuationSeries
    rangeYears?: number | null
}

const WIDTH = 720
const HEIGHT = 300
const PAD = { top: 18, right: 16, bottom: 30, left: 58 }

function dateValue(date: string) {
    return Date.parse(`${date}T00:00:00Z`)
}

function shortDate(date: string) {
    return date.slice(0, 4)
}

function formatMultiple(value: number) {
    return `${value.toFixed(1)}倍`
}

function formatStat(value: number) {
    return `${value.toFixed(2)}倍`
}

function pathFor(points: Array<{ x: number; y: number }>) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
}

export default function ValuationCurveChart({ series, rangeYears = 10 }: Props) {
    const resolvedTheme = useThemeStore((state) => state.resolved)
    const chart = useMemo(() => {
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
        const lower = Math.max(0, average - deviation)
        const upper = average + deviation
        const valuesWithBounds = [...values, current, lower, upper]
        const minValue = Math.max(0, Math.min(...valuesWithBounds) - Math.max(deviation * 0.15, 1))
        const maxValue = Math.max(...valuesWithBounds) + Math.max(deviation * 0.15, 1)
        const xStart = points[0]?.date || series.updated
        const xEnd = series.currentDate || latestDate
        const startTime = dateValue(xStart)
        const endTime = Math.max(dateValue(xEnd), dateValue(xStart) + 1)
        const xAt = (point: ValuationPoint) => PAD.left + ((dateValue(point.date) - startTime) / (endTime - startTime)) * (WIDTH - PAD.left - PAD.right)
        const yAt = (value: number) => PAD.top + ((maxValue - value) / (maxValue - minValue || 1)) * (HEIGHT - PAD.top - PAD.bottom)
        const linePoints = points.map((point) => ({ x: xAt(point), y: yAt(point.value) }))
        const bandTop = yAt(upper)
        const bandBottom = yAt(lower)

        return {
            points,
            current,
            average,
            lower,
            upper,
            min: Math.min(...values, current),
            max: Math.max(...values, current),
            path: pathFor(linePoints),
            currentY: yAt(current),
            bandTop,
            bandBottom,
            xStart,
            xEnd,
        }
    }, [series, rangeYears])

    const gridColor = readToken('--chart-grid')
    const mutedColor = readToken('--chart-muted')

    return (
        <div className={styles.wrapper} data-theme={resolvedTheme}>
            <div className={styles.chartMeta}>时间范围：近{rangeYears == null ? '全部' : `${rangeYears}年`}</div>
            <svg className={styles.canvas} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${series.name}前向市盈率曲线`}>
                <rect
                    className={styles.deviationBand}
                    x={PAD.left}
                    y={chart.bandTop}
                    width={WIDTH - PAD.left - PAD.right}
                    height={Math.max(0, chart.bandBottom - chart.bandTop)}
                />
                {[0, 0.5, 1].map((ratio) => {
                    const y = PAD.top + ratio * (HEIGHT - PAD.top - PAD.bottom)
                    return <line key={ratio} x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke={gridColor} />
                })}
                <line className={styles.todayLine} x1={PAD.left} x2={WIDTH - PAD.right} y1={chart.currentY} y2={chart.currentY} />
                <path className={styles.valueLine} d={chart.path} />
                <text className={styles.axisLabel} x={PAD.left - 8} y={chart.bandTop + 4} textAnchor="end" fill={mutedColor}>{formatMultiple(chart.upper)}</text>
                <text className={styles.axisLabel} x={PAD.left - 8} y={chart.bandBottom + 4} textAnchor="end" fill={mutedColor}>{formatMultiple(chart.lower)}</text>
                <text className={styles.todayLabel} x={WIDTH - PAD.right} y={chart.currentY - 6} textAnchor="end">今日 {formatMultiple(chart.current)}</text>
                <text className={styles.axisLabel} x={PAD.left} y={HEIGHT - 8} fill={mutedColor}>{shortDate(chart.xStart)}</text>
                <text className={styles.axisLabel} x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end" fill={mutedColor}>{shortDate(chart.xEnd)}</text>
            </svg>
            <div className={styles.stats}>
                <span>最低 {formatStat(chart.min)}</span>
                <span>平均 {formatStat(chart.average)}</span>
                <span>最高 {formatStat(chart.max)}</span>
            </div>
            <div className={styles.deviationHint}>浅红区域：均值 ±1 标准差</div>
        </div>
    )
}

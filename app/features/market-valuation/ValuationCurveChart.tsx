import { useMemo } from 'react'
import { readToken, useThemeStore } from '~/common/theme/themeStore'
import type { MarketValuationSeries } from './types'
import styles from './ValuationCurveChart.module.less'

type Props = { series: MarketValuationSeries[] }

const WIDTH = 720
const HEIGHT = 300
const PAD = { top: 18, right: 16, bottom: 30, left: 42 }

function pathFor(points: Array<{ x: number; y: number }>) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
}

function shortDate(date: string) {
    const [year, month] = date.split('-')
    return `${year.slice(2)}.${month}`
}

export default function ValuationCurveChart({ series }: Props) {
    const resolvedTheme = useThemeStore((state) => state.resolved)
    const chart = useMemo(() => {
        const allPoints = series.flatMap((item) => item.points)
        const max = Math.max(...allPoints.map((point) => point.value), 1)
        const min = 0
        const xAt = (index: number, length: number) => PAD.left + (index / Math.max(length - 1, 1)) * (WIDTH - PAD.left - PAD.right)
        const yAt = (value: number) => PAD.top + ((max - value) / (max - min || 1)) * (HEIGHT - PAD.top - PAD.bottom)
        return {
            max,
            lines: series.map((item) => ({
                ...item,
                path: pathFor(item.points.map((point, index) => ({ x: xAt(index, item.points.length), y: yAt(point.value) }))),
            })),
            labels: [series[0]?.points[0]?.date, series[0]?.points[series[0].points.length - 1]?.date].filter(Boolean).map(shortDate),
        }
    }, [series])

    const gridColor = readToken('--chart-grid')
    const mutedColor = readToken('--chart-muted')

    return (
        <div className={styles.wrapper} data-theme={resolvedTheme}>
            <div className={styles.header}>
                <span className={styles.title}>前向市盈率</span>
                <div className={styles.legend}>
                    {series.map((item, index) => (
                        <span className={styles.legendItem} key={item.id}>
                            <span className={index === 0 ? styles.ndxDot : styles.sp500Dot} />
                            {item.name}
                        </span>
                    ))}
                </div>
            </div>
            <svg className={styles.canvas} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="纳斯达克100与标普500前向市盈率曲线">
                {[0, 0.5, 1].map((ratio) => {
                    const y = PAD.top + ratio * (HEIGHT - PAD.top - PAD.bottom)
                    return <line key={ratio} x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke={gridColor} />
                })}
                <text x={PAD.left - 8} y={PAD.top + 4} textAnchor="end" fill={mutedColor}>{chart.max.toFixed(0)}x</text>
                <text x={PAD.left - 8} y={HEIGHT - PAD.bottom + 4} textAnchor="end" fill={mutedColor}>0x</text>
                {chart.lines.map((line, index) => (
                    <path key={line.id} d={line.path} className={index === 0 ? styles.ndxLine : styles.sp500Line} />
                ))}
                <text x={PAD.left} y={HEIGHT - 8} fill={mutedColor}>{chart.labels[0]}</text>
                <text x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end" fill={mutedColor}>{chart.labels[1]}</text>
            </svg>
        </div>
    )
}

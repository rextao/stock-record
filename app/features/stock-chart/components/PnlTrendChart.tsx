import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { readToken, useThemeStore } from '~/common/theme/themeStore'
import styles from './PnlTrendChart.module.less'

export interface TrendPoint {
    date: string
    value: number
}

interface Props {
    points: TrendPoint[]
}

function shortDate(ymd: string) {
    const p = ymd.split('-')
    return `${Number(p[1])}.${Number(p[2])}`
}

// 核心绘图逻辑 100% 复用你原有的代码
function drawChart(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    points: TrendPoint[],
    lineColor: string,
    fillColor: string,
    muted: string,
    separator: string
) {
    ctx.clearRect(0, 0, width, height)
    if (!points.length) return

    const padL = 8
    const padR = 8
    const padT = 14
    const padB = 24
    const w = width - padL - padR
    const h = height - padT - padB
    const values = points.map((p) => p.value)
    let min = Math.min(...values, 0)
    let max = Math.max(...values, 0)
    if (min === max) {
        min -= 1
        max += 1
    }
    const span = max - min || 1

    const xAt = (i: number) => padL + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w)
    const yAt = (v: number) => padT + ((max - v) / span) * h

    ctx.strokeStyle = separator
    ctx.lineWidth = 1
    for (let i = 0; i < 3; i++) {
        const y = padT + (h * i) / 2
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(padL + w, y)
        ctx.stroke()
    }

    const zeroY = yAt(0)
    if (min < 0 && max > 0) {
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = muted
        ctx.beginPath()
        ctx.moveTo(padL, zeroY)
        ctx.lineTo(padL + w, zeroY)
        ctx.stroke()
        ctx.setLineDash([])
    }

    ctx.beginPath()
    points.forEach((p, i) => {
        const x = xAt(i)
        const y = yAt(p.value)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    })
    ctx.lineTo(xAt(points.length - 1), zeroY)
    ctx.lineTo(xAt(0), zeroY)
    ctx.closePath()
    ctx.fillStyle = fillColor
    ctx.fill()

    ctx.beginPath()
    points.forEach((p, i) => {
        const x = xAt(i)
        const y = yAt(p.value)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()

    const last = points[points.length - 1]
    ctx.beginPath()
    ctx.arc(xAt(points.length - 1), yAt(last.value), 3.5, 0, Math.PI * 2)
    ctx.fillStyle = lineColor
    ctx.fill()

    ctx.fillStyle = muted
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(shortDate(points[0].date), padL, height - 8)
    ctx.textAlign = 'right'
    ctx.fillText(shortDate(last.date), padL + w, height - 8)
}

export default function PnlTrendChart({ points }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    // 主题切换后 Canvas 不会自动重绘，把 resolved 作为依赖显式触发一次
    const resolvedTheme = useThemeStore((s) => s.resolved)

    const last = points[points.length - 1]?.value ?? 0
    const isUp = last >= 0

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Canvas 拿不到 CSS 变量，只能在绘制时把令牌读成字符串
        const lineColor = readToken(isUp ? '--pnl-up' : '--pnl-down')
        const fillColor = readToken(isUp ? '--pnl-up-fill' : '--pnl-down-fill')
        const mutedColor = readToken('--chart-muted')
        const separatorColor = readToken('--chart-grid')

        // 获取 Canvas 在屏幕上的真实 CSS 尺寸
        const rect = canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1

        // 针对高清屏(Retina)放大画布物理像素，防止模糊
        canvas.width = rect.width * dpr
        canvas.height = rect.height * dpr
        ctx.scale(dpr, dpr)

        drawChart(ctx, rect.width, rect.height, points, lineColor, fillColor, mutedColor, separatorColor)
    }, [points, isUp, resolvedTheme])

    return (
        <div className={styles.wrapper}>
            <div className={styles.header}>
                <span className={styles.title}>盈亏趋势</span>
                <span className={clsx(styles.value, isUp ? styles.up : styles.down)}>
                    {isUp ? '+' : ''}{last.toFixed(2)}
                </span>
            </div>
            {/* CSS 视觉尺寸由 .canvas 固定，物理像素在 effect 里按 dpr 放大 */}
            <canvas ref={canvasRef} className={styles.canvas} />
        </div>
    )
}

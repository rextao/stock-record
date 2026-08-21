import { useEffect, useRef } from 'react'

export interface TrendPoint {
    date: string
    value: number
}

interface Props {
    points: TrendPoint[]
}

function hexToRgba(hex: string, alpha: number) {
    const h = hex.replace('#', '')
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    return `rgba(${r},${g},${b},${alpha})`
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
    ctx.fillStyle = hexToRgba(lineColor, 0.16)
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

    const last = points[points.length - 1]?.value ?? 0
    const lineColor = last >= 0 ? '#FF5252' : '#00E676'
    const mutedColor = '#6B7280'
    const separatorColor = 'rgba(255,255,255,0.06)'

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // 获取 Canvas 在屏幕上的真实 CSS 尺寸
        const rect = canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1

        // 针对高清屏(Retina)放大画布物理像素，防止模糊
        canvas.width = rect.width * dpr
        canvas.height = rect.height * dpr
        ctx.scale(dpr, dpr)

        drawChart(ctx, rect.width, rect.height, points, lineColor, mutedColor, separatorColor)
    }, [points, lineColor])

    return (
        <div style={{ marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 500, color: '#F8F9FA' }}>盈亏趋势</span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: lineColor }}>
          {last >= 0 ? '+' : ''}{last.toFixed(2)}
        </span>
            </div>
            {/* 设定 CSS 视觉尺寸 */}
            <canvas ref={canvasRef} style={{ width: '100%', height: '220px', display: 'block' }} />
        </div>
    )
}

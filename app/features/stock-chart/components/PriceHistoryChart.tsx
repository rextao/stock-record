import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { readToken, useThemeStore } from '~/common/theme/themeStore'
import type { PriceCandle, TradeMark } from '../types'
import styles from './PriceHistoryChart.module.less'

/**
 * 合并后的买卖点。频繁交易时同方向、横坐标挨得太近的成交会并成一个标记（B3），
 * 否则 1 年区间下相邻交易日只差一两个像素，圆点会糊成一团。
 */
export interface MarkGroup {
    key: string
    side: 'buy' | 'sell'
    /** 锚点日线索引：标记画在这一根上 */
    index: number
    /** 数量加权均价，合并后的纵坐标取它才有实际意义 */
    price: number
    quantity: number
    marks: TradeMark[]
}

/** 最近一次卖出：画一条水平参考线，并在标记旁标出这笔的收益 */
export interface LastSellLine {
    price: number
    profit: number
    date: string
}

interface Props {
    candles: PriceCandle[]
    marks: TradeMark[]
    lastSell?: LastSellLine | null
    selectedKey?: string | null
    onSelect?: (group: MarkGroup | null) => void
    /** 日内粒度：同一天有多个点，选中标签要标到分钟 */
    intraday?: boolean
    /** 交易所时区偏移（秒），把时间戳还原成当地时间用 */
    utcOffsetSeconds?: number
}

interface Palette {
    line: string
    fill: string
    grid: string
    muted: string
    text: string
    bg: string
    buy: string
    sell: string
}

interface Placed {
    group: MarkGroup
    dotX: number
    dotY: number
    x0: number
    x1: number
    y0: number
    y1: number
}

const PAD_L = 44
const PAD_T = 24
const PAD_B = 26
const GRID_LINES = 4
/** 同方向的成交横向间距小于这个像素就合并 */
const MERGE_PX = 20
const DOT_R = 3
const BUBBLE_H = 16
/** 圆点到标签气泡的垂直间距，中间用一根细线连起来 */
const BUBBLE_GAP = 12
/** 点击命中半径 */
const HIT_R = 26

/**
 * 时间戳换成交易所当地时间的字段。
 * 先加偏移再读 UTC 字段 —— 直接用本地 getter 会落进浏览器时区，
 * 美股 10:30 在北京会显示成 22:30，读不懂。
 */
const localParts = (t: number, offsetSeconds: number) => {
    const d = new Date(t + offsetSeconds * 1000)
    return {
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
    }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 底部刻度：只到日，日内区间也一样 —— 三个刻度横跨好几天，标到分钟反而占地方 */
const tickLabel = (candle: PriceCandle, offsetSeconds: number) => {
    const p = localParts(candle.t, offsetSeconds)
    return p.month + '.' + p.day
}

/** 选中时的精确标签：日内要带时分，否则同一天的几个点看起来完全一样 */
const exactLabel = (candle: PriceCandle, offsetSeconds: number, intraday: boolean) => {
    const p = localParts(candle.t, offsetSeconds)
    const date = pad2(p.month) + '-' + pad2(p.day)
    return intraday ? date + ' ' + pad2(p.hour) + ':' + pad2(p.minute) : date
}

/** 价格标签的小数位随量级变，几千块的标的不需要两位小数占满左边距 */
const priceLabel = (value: number, span: number) => {
    if (span >= 100) return value.toFixed(0)
    if (span >= 10) return value.toFixed(1)
    return value.toFixed(2)
}

const signedAmount = (value: number) =>
    (value >= 0 ? '+' : '-') + Math.round(Math.abs(value)).toLocaleString('en-US')

/**
 * 把成交日对齐到折线上的某个点：取「日期不晚于成交日」的最后一根日线。
 * 周末或停牌下单时成交日本身不在序列里，落到前一个交易日最自然；
 * 早于区间起点的成交点直接丢弃，硬画在左边缘会读成「区间内买的」。
 */
const markIndex = (candles: PriceCandle[], date: string) => {
    let found = -1
    for (let i = 0; i < candles.length; i++) {
        if (candles[i].date <= date) found = i
        else break
    }
    return found
}

function buildGroups(candles: PriceCandle[], marks: TradeMark[], xAt: (i: number) => number) {
    const groups: MarkGroup[] = []
    const sides: Array<'buy' | 'sell'> = ['buy', 'sell']

    sides.forEach((side) => {
        const entries = marks
            .filter((mark) => mark.side === side)
            .map((mark) => ({ mark, index: markIndex(candles, mark.date) }))
            .filter((entry) => entry.index >= 0)
            .sort((a, b) => a.index - b.index)

        let bucket: typeof entries = []
        const flush = () => {
            if (!bucket.length) return
            const index = bucket[bucket.length - 1].index
            const quantity = bucket.reduce((sum, entry) => sum + (entry.mark.quantity || 0), 0)
            const price =
                quantity > 0
                    ? bucket.reduce((sum, entry) => sum + entry.mark.price * (entry.mark.quantity || 0), 0) / quantity
                    : bucket.reduce((sum, entry) => sum + entry.mark.price, 0) / bucket.length
            groups.push({
                // 锚点索引唯一，同方向不会撞 key；选中态靠它跨重绘存活
                key: side + ':' + index,
                side,
                index,
                price,
                quantity,
                marks: bucket.map((entry) => entry.mark),
            })
            bucket = []
        }

        entries.forEach((entry) => {
            const prev = bucket[bucket.length - 1]
            if (prev && xAt(entry.index) - xAt(prev.index) > MERGE_PX) flush()
            bucket.push(entry)
        })
        flush()
    })

    return groups
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    // 不用 ctx.roundRect：iOS 16 之前没有，手画一遍成本更低
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
}

function drawChart(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    candles: PriceCandle[],
    marks: TradeMark[],
    lastSell: LastSellLine | null,
    selectedKey: string | null,
    palette: Palette,
    offsetSeconds: number,
    intraday: boolean
): Placed[] {
    ctx.clearRect(0, 0, width, height)
    if (!candles.length) return []

    // 有水平参考线时右侧要留出价格标签的位置
    const padR = lastSell ? 54 : 12
    const w = width - PAD_L - padR
    const h = height - PAD_T - PAD_B
    if (w <= 0 || h <= 0) return []

    const xAt = (i: number) => PAD_L + (candles.length === 1 ? w / 2 : (i / (candles.length - 1)) * w)
    const groups = buildGroups(candles, marks, xAt)

    // 成交价和参考线价格都参与取值域，否则它们落在区间外时会贴边看不出位置
    const values = candles.map((c) => c.close).concat(groups.map((g) => g.price))
    if (lastSell) values.push(lastSell.price)
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) {
        min -= 1
        max += 1
    }
    const pad = (max - min) * 0.06
    min -= pad
    max += pad
    const span = max - min || 1
    const yAt = (v: number) => PAD_T + ((max - v) / span) * h

    // 网格 + 左侧价格刻度
    ctx.font = '10px sans-serif'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= GRID_LINES; i++) {
        const y = PAD_T + (h * i) / GRID_LINES
        ctx.strokeStyle = palette.grid
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(PAD_L, y)
        ctx.lineTo(PAD_L + w, y)
        ctx.stroke()

        ctx.fillStyle = palette.muted
        ctx.textAlign = 'right'
        ctx.fillText(priceLabel(max - (span * i) / GRID_LINES, span), PAD_L - 6, y)
    }

    const linePath = () => {
        ctx.beginPath()
        candles.forEach((c, i) => {
            const x = xAt(i)
            const y = yAt(c.close)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        })
    }

    linePath()
    ctx.lineTo(xAt(candles.length - 1), PAD_T + h)
    ctx.lineTo(xAt(0), PAD_T + h)
    ctx.closePath()
    ctx.fillStyle = palette.fill
    ctx.fill()

    linePath()
    ctx.strokeStyle = palette.line
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()

    // 最近一次卖价的水平参考线
    if (lastSell) {
        const y = yAt(lastSell.price)
        ctx.save()
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = palette.sell
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(PAD_L, y)
        ctx.lineTo(PAD_L + w, y)
        ctx.stroke()
        ctx.restore()

        ctx.fillStyle = palette.sell
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(lastSell.price.toFixed(2), width - 4, y)
    }

    // 底部日期刻度：只标首、中、末，移动端再密就糊了
    ctx.fillStyle = palette.muted
    ctx.textBaseline = 'alphabetic'
    const ticks = candles.length > 2 ? [0, Math.floor((candles.length - 1) / 2), candles.length - 1] : [0, candles.length - 1]
    Array.from(new Set(ticks)).forEach((i, pos, arr) => {
        ctx.textAlign = pos === 0 ? 'left' : pos === arr.length - 1 ? 'right' : 'center'
        ctx.fillText(tickLabel(candles[i], offsetSeconds), xAt(i), height - 8)
    })

    // 选中态：竖向辅助线 + 精确日期，代替 hover
    const selected = groups.find((g) => g.key === selectedKey) || null
    if (selected) {
        const x = xAt(selected.index)
        ctx.save()
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = palette.muted
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, PAD_T)
        ctx.lineTo(x, PAD_T + h)
        ctx.stroke()
        ctx.restore()

        const label = exactLabel(candles[selected.index], offsetSeconds, intraday)
        ctx.font = '10px sans-serif'
        const tw = ctx.measureText(label).width
        const cx = Math.min(Math.max(x, PAD_L + tw / 2), PAD_L + w - tw / 2)
        // 底部刻度可能就在同一位置，先铺一层底色盖住
        ctx.fillStyle = palette.bg
        ctx.fillRect(cx - tw / 2 - 3, height - 18, tw + 6, 14)
        ctx.fillStyle = palette.text
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(label, cx, height - 8)
    }

    // 买卖标记：圆点钉在成交价上，标签气泡错开画（买在下、卖在上），同侧相撞就纵向让位
    const placed: Placed[] = []
    const lastSellIndex = lastSell ? markIndex(candles, lastSell.date) : -1

    groups
        .slice()
        .sort((a, b) => a.index - b.index)
        .forEach((group) => {
            const isBuy = group.side === 'buy'
            const dotX = xAt(group.index)
            const dotY = Math.min(Math.max(yAt(group.price), PAD_T), PAD_T + h)
            const text = 'BS'[isBuy ? 0 : 1] + (group.marks.length > 1 ? String(group.marks.length) : '')

            ctx.font = 'bold 10px sans-serif'
            const bw = Math.max(ctx.measureText(text).width + 10, BUBBLE_H)
            let cy = isBuy ? dotY + BUBBLE_GAP + BUBBLE_H / 2 : dotY - BUBBLE_GAP - BUBBLE_H / 2

            const overlaps = (candidate: number) =>
                placed.some(
                    (other) =>
                        other.group.side === group.side &&
                        dotX - bw / 2 < other.x1 + 2 &&
                        dotX + bw / 2 > other.x0 - 2 &&
                        candidate - BUBBLE_H / 2 < other.y1 + 2 &&
                        candidate + BUBBLE_H / 2 > other.y0 - 2
                )

            let guard = 0
            while (overlaps(cy) && guard < 12) {
                cy += isBuy ? BUBBLE_H + 2 : -(BUBBLE_H + 2)
                guard++
            }
            // 允许探进内边距，但不能压到底部日期刻度上
            cy = Math.min(Math.max(cy, BUBBLE_H / 2 + 2), height - 22)

            const color = isBuy ? palette.buy : palette.sell

            ctx.strokeStyle = color
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(dotX, dotY)
            ctx.lineTo(dotX, cy)
            ctx.stroke()

            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(dotX, dotY, DOT_R, 0, Math.PI * 2)
            ctx.fill()

            roundRect(ctx, dotX - bw / 2, cy - BUBBLE_H / 2, bw, BUBBLE_H, BUBBLE_H / 2)
            ctx.fillStyle = color
            ctx.fill()
            if (group.key === selectedKey) {
                ctx.strokeStyle = palette.text
                ctx.lineWidth = 2
                ctx.stroke()
            }

            ctx.fillStyle = '#ffffff'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(text, dotX, cy + 0.5)

            // 最后一笔卖出旁边挂上这次的收益金额
            if (lastSell && !isBuy && group.index === lastSellIndex) {
                ctx.font = 'bold 10px sans-serif'
                ctx.fillStyle = palette.sell
                const right = dotX + bw / 2 + 4
                const amount = signedAmount(lastSell.profit)
                const aw = ctx.measureText(amount).width
                // 靠右画不下就翻到气泡左边
                if (right + aw < width - 2) {
                    ctx.textAlign = 'left'
                    ctx.fillText(amount, right, cy + 0.5)
                } else {
                    ctx.textAlign = 'right'
                    ctx.fillText(amount, dotX - bw / 2 - 4, cy + 0.5)
                }
            }

            placed.push({
                group,
                dotX,
                dotY,
                x0: dotX - bw / 2,
                x1: dotX + bw / 2,
                y0: cy - BUBBLE_H / 2,
                y1: cy + BUBBLE_H / 2,
            })
        })

    return placed
}

export default function PriceHistoryChart({
    candles,
    marks,
    lastSell = null,
    selectedKey = null,
    onSelect,
    intraday = false,
    utcOffsetSeconds = 0,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    // 命中测试要用最后一次绘制出来的坐标，存在 ref 里，重绘时整体替换
    const placedRef = useRef<Placed[]>([])
    // Canvas 不会因为主题变化重绘，把 resolved 放进依赖显式触发
    const resolvedTheme = useThemeStore((s) => s.resolved)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const first = candles[0]?.close ?? 0
        const last = candles[candles.length - 1]?.close ?? 0
        const isUp = last >= first

        // Canvas 读不到 CSS 变量，绘制前把令牌解析成字符串
        const palette: Palette = {
            line: readToken(isUp ? '--pnl-up' : '--pnl-down'),
            fill: readToken(isUp ? '--pnl-up-fill' : '--pnl-down-fill'),
            grid: readToken('--chart-grid'),
            muted: readToken('--chart-muted'),
            text: readToken('--text-primary'),
            bg: readToken('--card-bg'),
            buy: readToken('--pnl-up'),
            sell: readToken('--pnl-down'),
        }

        const render = () => {
            const rect = canvas.getBoundingClientRect()
            if (!rect.width || !rect.height) return
            const dpr = window.devicePixelRatio || 1
            // 高清屏放大物理像素，否则折线和文字都发虚
            canvas.width = Math.round(rect.width * dpr)
            canvas.height = Math.round(rect.height * dpr)
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            placedRef.current = drawChart(
                ctx,
                rect.width,
                rect.height,
                candles,
                marks,
                lastSell,
                selectedKey,
                palette,
                utcOffsetSeconds,
                intraday
            )
        }

        render()

        // 画布高度是 flex 撑出来的，旋屏或键盘收起都会改尺寸，必须跟着重绘
        const observer = new ResizeObserver(render)
        observer.observe(canvas)
        return () => observer.disconnect()
    }, [candles, marks, lastSell, selectedKey, resolvedTheme, intraday, utcOffsetSeconds])

    const handleTap = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!onSelect) return
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const px = event.clientX - rect.left
        const py = event.clientY - rect.top

        let hit: Placed | null = null
        let best = HIT_R * HIT_R
        placedRef.current.forEach((item) => {
            // 气泡和圆点都算命中，取更近的那个距离
            const cx = item.dotX
            const cy = (item.y0 + item.y1) / 2
            const d1 = (px - cx) ** 2 + (py - cy) ** 2
            const d2 = (px - item.dotX) ** 2 + (py - item.dotY) ** 2
            const d = Math.min(d1, d2)
            if (d < best) {
                best = d
                hit = item
            }
        })

        const group = hit ? (hit as Placed).group : null
        // 再点一次同一个标记就收起明细
        onSelect(group && group.key === selectedKey ? null : group)
    }

    return (
        <div className={styles.wrapper}>
            <div className={styles.canvasBox}>
                <canvas ref={canvasRef} className={styles.canvas} onPointerUp={handleTap} />
            </div>
        </div>
    )
}

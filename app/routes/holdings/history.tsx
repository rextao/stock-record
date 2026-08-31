import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { DatePicker, NavBar, SpinLoading, Toast } from 'antd-mobile'
import { CalendarDays } from 'lucide-react'
import clsx from 'clsx'
import {
    fetchHoldingDetail,
    fetchPriceHistory,
    updateSellRecordTime,
    updateTradeBuyTime,
} from '../../api/trading'
import PriceHistoryChart, {
    type LastSellLine,
    type MarkGroup,
} from '../../features/stock-chart/components/PriceHistoryChart'
import {
    DEFAULT_HISTORY_RANGE,
    HISTORY_RANGES,
    canDrawCandles,
    isIntradayRange,
    MAX_CANDLE_BARS,
    type HistoryRange,
    type PriceHistory,
    type TradeMark,
} from '../../features/stock-chart/types'
import type { HoldingDetailPayload, HoldingTradeDetail } from '../../features/trade-record/types'
import styles from './history.module.less'

const RANGE_LABELS: Record<HistoryRange, string> = {
    '5d': '1周',
    '1mo': '1月',
    '3mo': '3月',
    '6mo': '6月',
    '1y': '1年',
    ytd: '年初',
}

type ChartMode = 'line' | 'candle'

const MODE_LABELS: Record<ChartMode, string> = { line: '折线', candle: 'K线' }
const CHART_MODES: ChartMode[] = ['line', 'candle']

// 刻意不写 clientLoader：RR7 会等 loader 结算才渲染新页面，而全仓没有 pending 指示，
// 点「走势」看起来就像卡住。标的名/代码由首页卡片通过 location.state 带过来，
// 详情（买卖点）在页面内自己异步拉。

/** 从 Date 取当地 YYYY-MM-DD，不能用 toISOString（会按 UTC 折算，早八点前会退一天） */
function toLocalYmd(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** YYYY-MM-DD → 当地 Date，喂给 DatePicker 的初始值 */
function fromYmd(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map(Number)
    if (!y || !m || !d) return new Date()
    return new Date(y, m - 1, d)
}

/**
 * 交易记录 → 折线上的买卖点。
 * 注意 trades.current_price 存的是**买入价**（字段名是历史遗留），别当成现价用。
 */
function toMarks(trades: HoldingTradeDetail[]): TradeMark[] {
    const marks: TradeMark[] = []
    trades.forEach((trade) => {
        if (trade.buy_time) {
            marks.push({
                date: trade.buy_time.slice(0, 10),
                sourceId: trade.id,
                time: trade.buy_time,
                price: trade.current_price,
                quantity: trade.buy_quantity,
                side: 'buy',
            })
        }
        trade.sell_records?.forEach((record) => {
            if (!record.sell_time) return
            marks.push({
                date: record.sell_time.slice(0, 10),
                sourceId: record.id,
                time: record.sell_time,
                price: record.sell_price,
                quantity: record.sell_quantity,
                side: 'sell',
                // 单笔卖出的实现盈亏，与详情页算法一致
                profit: (record.sell_price - trade.current_price) * record.sell_quantity,
            })
        })
    })
    return marks.sort((a, b) => a.date.localeCompare(b.date))
}

/** 最近一次卖出：水平参考线的价格和这笔的收益 */
function toLastSell(trades: HoldingTradeDetail[]): LastSellLine | null {
    let latestTime = ''
    let line: LastSellLine | null = null
    trades.forEach((trade) => {
        trade.sell_records?.forEach((record) => {
            if (!record.sell_time || record.sell_time <= latestTime) return
            latestTime = record.sell_time
            line = {
                price: record.sell_price,
                profit: (record.sell_price - trade.current_price) * record.sell_quantity,
                date: record.sell_time.slice(0, 10),
            }
        })
    })
    return line
}

export default function HoldingsHistoryRoute() {
    const navigate = useNavigate()
    const params = useParams()
    const itemId = Number(params.id)
    // 首页卡片带过来的标的名/代码，首屏直接可用；冷启动直接落到本页时为空，等详情回来
    const hint = (useLocation().state || null) as { name?: string; symbol?: string } | null

    const [detail, setDetail] = useState<HoldingDetailPayload | null>(null)
    const [detailError, setDetailError] = useState<string | null>(null)
    // 改完成交日期后自增，只重拉详情，不动行情
    const [detailKey, setDetailKey] = useState(0)
    const [range, setRange] = useState<HistoryRange>(DEFAULT_HISTORY_RANGE)
    // 画法只在本次浏览内有效，不持久化：多数时候看的是折线，记住反而容易忘了自己切过
    const [chartMode, setChartMode] = useState<ChartMode>('line')
    const [history, setHistory] = useState<PriceHistory | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    // 点「重试」时自增，用来重新触发同一区间的请求
    const [reloadKey, setReloadKey] = useState(0)
    // 失败后的冷却秒数。上游限流时用户越点越被限，重试和切区间都要先按住
    const [cooldown, setCooldown] = useState(0)
    // 点中的买卖标记；明细展示在图表下方，手机上比 hover 好用
    const [selected, setSelected] = useState<MarkGroup | null>(null)
    // 正在改日期的那个标记；非空时弹 DatePicker
    const [editing, setEditing] = useState<TradeMark | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!itemId) {
            setDetailError('无效的标的 ID')
            return
        }
        const controller = new AbortController()
        fetchHoldingDetail(itemId, { signal: controller.signal })
            .then((next) => {
                setDetail(next)
                setDetailError(null)
            })
            .catch((err: any) => {
                if (controller.signal.aborted) return
                setDetailError(err?.message || '加载持仓详情失败')
            })
        return () => controller.abort()
    }, [itemId, detailKey])

    const symbol = detail?.holding.item_symbol ?? hint?.symbol ?? ''
    const title = detail?.holding.item_name || hint?.name || '历史走势'
    const candles = history?.candles ?? []
    const trades = useMemo<HoldingTradeDetail[]>(
        () => (detail ? [...detail.openTrades, ...detail.closedTrades] : []),
        [detail],
    )
    const marks = useMemo(() => toMarks(trades), [trades])
    const lastSell = useMemo(() => toLastSell(trades), [trades])
    // 长区间（点数超上限）或缺 OHLC 时 K 线画不了，开关照旧可点，只是渲染折线 + 一行说明
    const candleReady = useMemo(() => canDrawCandles(candles), [candles])
    const candleFellBack = chartMode === 'candle' && candles.length > 0 && !candleReady

    // 换区间或改完日期后旧的选中项可能已经不在图上了，直接收起
    useEffect(() => {
        setSelected(null)
    }, [history, marks])

    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setTimeout(() => setCooldown((n) => n - 1), 1000)
        return () => clearTimeout(timer)
    }, [cooldown])

    useEffect(() => {
        // 详情还没回来时代码是空的，什么都不动：loading 保持 true，骨架继续转
        if (!symbol) return

        // 快速切区间会有多个请求在飞，旧的必须取消，否则先发后到会覆盖新数据
        const controller = new AbortController()
        setLoading(true)
        setError(null)

        fetchPriceHistory(symbol, range, { signal: controller.signal })
            .then((next) => {
                setHistory(next)
                setLoading(false)
            })
            .catch((err: any) => {
                if (controller.signal.aborted) return
                setHistory(null)
                // Worker 已经把上游异常翻成中文文案了，直接透出
                setError(err?.message || '加载失败')
                // 限流要等得久一点；其余异常给个短冷却，避免连点把上游打得更死
                setCooldown(err?.reason === 'HISTORY_RATE_LIMITED' ? 20 : 3)
                setLoading(false)
            })

        return () => controller.abort()
    }, [symbol, range, reloadKey])

    const retry = useCallback(() => {
        if (cooldown > 0) return
        setReloadKey((n) => n + 1)
        setDetailKey((n) => n + 1)
    }, [cooldown])

    // 只改日期，时分秒沿用原值：DB 里排序和「最近一次卖出」都依赖完整时刻
    const confirmDate = useCallback(
        async (value: Date) => {
            const mark = editing
            setEditing(null)
            if (!mark) return
            const ymd = toLocalYmd(value)
            if (ymd === mark.date) return
            const time = ymd + (mark.time.length > 10 ? mark.time.slice(10) : ' 00:00:00')
            setSaving(true)
            try {
                if (mark.side === 'buy') await updateTradeBuyTime(mark.sourceId, time)
                else await updateSellRecordTime(mark.sourceId, time)
                Toast.show({ icon: 'success', content: '日期已更新' })
                setDetailKey((n) => n + 1)
            } catch (err: any) {
                Toast.show({ icon: 'fail', content: err?.message || '更新失败' })
            } finally {
                setSaving(false)
            }
        },
        [editing],
    )

    // 详情已经有结论但仍然没有代码 —— 这才是真的拉不了行情
    const blockedMsg =
        !symbol && (detail != null || detailError != null)
            ? detailError || '该标的没有登记代码，无法拉取历史行情'
            : null

    const first = candles[0]?.close
    const last = candles[candles.length - 1]?.close
    const diff = first != null && last != null ? last - first : null
    const diffPct = diff != null && first ? (diff / first) * 100 : null

    return (
        <div className={styles.page}>
            {/* 入口是首页持仓卡片，返回直接回首页，冷启动落到本页时也有确定去处 */}
            <NavBar onBack={() => navigate('/', { replace: true })} className={styles.navBar}>
                {title}
            </NavBar>

            <div className={styles.body}>
                <div className={styles.summary}>
                    <span className={styles.symbol}>{symbol || '--'}</span>
                    <span className={styles.lastPrice}>{last != null ? last.toFixed(2) : '--'}</span>
                    {diff != null && diffPct != null && (
                        <span className={clsx(styles.change, diff >= 0 ? styles.up : styles.down)}>
                            {diff >= 0 ? '+' : ''}
                            {diff.toFixed(2)}（{diff >= 0 ? '+' : ''}
                            {diffPct.toFixed(2)}%）
                        </span>
                    )}
                </div>

                <div className={styles.rangeBar}>
                    {HISTORY_RANGES.map((item) => (
                        <button
                            key={item}
                            type="button"
                            className={clsx(styles.rangeButton, item === range && styles.rangeButtonActive)}
                            disabled={cooldown > 0 && item !== range}
                            onClick={() => setRange(item)}
                        >
                            {RANGE_LABELS[item]}
                        </button>
                    ))}
                </div>

                <div className={styles.modeBar}>
                    {CHART_MODES.map((item) => (
                        <button
                            key={item}
                            type="button"
                            className={clsx(styles.modeButton, item === chartMode && styles.modeButtonActive)}
                            onClick={() => setChartMode(item)}
                        >
                            {MODE_LABELS[item]}
                        </button>
                    ))}
                    {candleFellBack && (
                        <span className={styles.modeHint}>
                            {candles.length > MAX_CANDLE_BARS ? '区间过长，已按折线显示' : '该区间缺开高低价，已按折线显示'}
                        </span>
                    )}
                </div>

                <div className={styles.chartArea}>
                    {loading && !blockedMsg ? (
                        <div className={styles.placeholder}>
                            <SpinLoading color="currentColor" />
                            加载中
                        </div>
                    ) : error || blockedMsg ? (
                        <div className={styles.placeholder}>
                            {error || blockedMsg}
                            <button
                                type="button"
                                className={styles.retryButton}
                                disabled={cooldown > 0}
                                onClick={retry}
                            >
                                {cooldown > 0 ? `重试（${cooldown}s）` : '重试'}
                            </button>
                        </div>
                    ) : candles.length === 0 ? (
                        <div className={styles.placeholder}>该区间没有行情数据</div>
                    ) : (
                        <PriceHistoryChart
                            candles={candles}
                            marks={marks}
                            lastSell={lastSell}
                            selectedKey={selected?.key ?? null}
                            onSelect={setSelected}
                            intraday={isIntradayRange(range)}
                            utcOffsetSeconds={history?.utcOffsetSeconds ?? 0}
                            mode={chartMode}
                        />
                    )}
                </div>

                {selected ? (
                    <div className={styles.detail}>
                        <div className={styles.detailHead}>
                            <span className={clsx(styles.detailSide, selected.side === 'buy' ? styles.up : styles.down)}>
                                {selected.side === 'buy' ? '买入' : '卖出'} {selected.marks.length} 笔
                            </span>
                            <span className={styles.detailMeta}>
                                均价 {selected.price.toFixed(2)} · 共 {selected.quantity} 仓
                            </span>
                        </div>
                        {selected.marks.map((mark, i) => (
                            <div key={mark.side + mark.date + i} className={styles.detailRow}>
                                <button
                                    type="button"
                                    className={styles.detailDate}
                                    disabled={saving}
                                    onClick={() => setEditing(mark)}
                                >
                                    {mark.date}
                                    <CalendarDays size={12} />
                                </button>
                                <span className={styles.detailValue}>
                                    {mark.price.toFixed(2)} × {mark.quantity}
                                </span>
                                {mark.profit != null ? (
                                    <span className={clsx(styles.detailProfit, mark.profit >= 0 ? styles.up : styles.down)}>
                                        {mark.profit >= 0 ? '+' : ''}
                                        {mark.profit.toFixed(2)}
                                    </span>
                                ) : (
                                    <span className={styles.detailProfit} />
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={styles.footnote}>
                        点 B / S 看成交明细（B3 表示合并了 3 笔），明细里点日期可以改成交日。1 周为小时线，其余为日收盘价（含除权除息调整），数据源
                        Yahoo Finance
                    </div>
                )}
            </div>

            {/* 成交日期纠错：只到天，时分秒沿用原值 */}
            <DatePicker
                title="修改成交日期"
                visible={editing != null}
                value={editing ? fromYmd(editing.date) : undefined}
                max={new Date()}
                onClose={() => setEditing(null)}
                onConfirm={confirmDate}
            />
        </div>
    )
}

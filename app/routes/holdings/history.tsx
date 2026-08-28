import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLoaderData, useNavigate } from 'react-router'
import { NavBar, SpinLoading } from 'antd-mobile'
import clsx from 'clsx'
import { fetchHoldingDetail, fetchPriceHistory } from '../../api/trading'
import PriceHistoryChart, {
    type LastSellLine,
    type MarkGroup,
} from '../../features/stock-chart/components/PriceHistoryChart'
import {
    DEFAULT_HISTORY_RANGE,
    HISTORY_RANGES,
    isIntradayRange,
    type HistoryRange,
    type PriceHistory,
    type TradeMark,
} from '../../features/stock-chart/types'
import type { HoldingTradeDetail } from '../../features/trade-record/types'
import styles from './history.module.less'

const RANGE_LABELS: Record<HistoryRange, string> = {
    '5d': '1周',
    '1mo': '1月',
    '3mo': '3月',
    '6mo': '6月',
    '1y': '1年',
    ytd: '年初',
}

// 买卖点和标的代码都在持仓详情里，不为这个页面单开接口
export async function clientLoader({ params, request }: { params: any; request: Request }) {
    return fetchHoldingDetail(Number(params.id), { signal: request.signal })
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
                price: trade.current_price,
                quantity: trade.buy_quantity,
                side: 'buy',
            })
        }
        trade.sell_records?.forEach((record) => {
            if (!record.sell_time) return
            marks.push({
                date: record.sell_time.slice(0, 10),
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
    const { holding, openTrades, closedTrades } = useLoaderData<typeof clientLoader>()
    const navigate = useNavigate()

    const [range, setRange] = useState<HistoryRange>(DEFAULT_HISTORY_RANGE)
    const [history, setHistory] = useState<PriceHistory | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    // 点「重试」时自增，用来重新触发同一区间的请求
    const [reloadKey, setReloadKey] = useState(0)
    // 点中的买卖标记；明细展示在图表下方，手机上比 hover 好用
    const [selected, setSelected] = useState<MarkGroup | null>(null)

    const symbol = holding.item_symbol
    const candles = history?.candles ?? []
    const trades = useMemo(() => [...openTrades, ...closedTrades], [openTrades, closedTrades])
    const marks = useMemo(() => toMarks(trades), [trades])
    const lastSell = useMemo(() => toLastSell(trades), [trades])

    // 换区间后旧的选中项可能已经不在图上了，直接收起
    useEffect(() => {
        setSelected(null)
    }, [history])

    useEffect(() => {
        if (!symbol) {
            setLoading(false)
            setError('该标的没有登记代码，无法拉取历史行情')
            return
        }

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
                setLoading(false)
            })

        return () => controller.abort()
    }, [symbol, range, reloadKey])

    const retry = useCallback(() => setReloadKey((n) => n + 1), [])

    const first = candles[0]?.close
    const last = candles[candles.length - 1]?.close
    const diff = first != null && last != null ? last - first : null
    const diffPct = diff != null && first ? (diff / first) * 100 : null

    return (
        <div className={styles.page}>
            {/* 入口是首页持仓卡片，返回直接回首页，冷启动落到本页时也有确定去处 */}
            <NavBar onBack={() => navigate('/', { replace: true })} className={styles.navBar}>
                {holding.item_name}
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
                            onClick={() => setRange(item)}
                        >
                            {RANGE_LABELS[item]}
                        </button>
                    ))}
                </div>

                <div className={styles.chartArea}>
                    {loading ? (
                        <div className={styles.placeholder}>
                            <SpinLoading color="currentColor" />
                            加载中
                        </div>
                    ) : error ? (
                        <div className={styles.placeholder}>
                            {error}
                            <button type="button" className={styles.retryButton} onClick={retry}>
                                重试
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
                                <span className={styles.detailDate}>{mark.date}</span>
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
                        点 B / S 看成交明细（B3 表示合并了 3 笔）。1 周为小时线，其余为日收盘价（含除权除息调整），数据源
                        Yahoo Finance
                    </div>
                )}
            </div>
        </div>
    )
}

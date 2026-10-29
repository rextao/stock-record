import { useEffect, useMemo, useState } from 'react'
import { NavBar, SpinLoading, Toast } from 'antd-mobile'
import { useLocation, useNavigate } from 'react-router'
import type { PriceCandle, PriceHistory } from '../../features/stock-chart/types'
import { fetchPriceHistory } from '../../api/trading'
import { evaluateAdjustment, type AdjustmentDecision, type DecisionLevel } from '../../features/trade-record/decision'
import styles from './decision.module.less'

const LEVELS: DecisionLevel[] = ['日线', '周线', '月线']

type DecisionLocationState = {
    itemId?: number
    name?: string
    symbol?: string | null
}

function formatPercent(value: number | null): string {
    return value == null ? '-' : `${value.toFixed(1)}%`
}

function formatDate(value: string | null): string {
    return value ? value.slice(5) : '-'
}

function formatDuration(decision: AdjustmentDecision): string {
    if (decision.durationDays == null) return '-'
    if (decision.durationUnit === '月') return `${decision.durationMonths}个月`
    if (decision.durationUnit === '周') return `${(decision.durationDays / 7).toFixed(1)}周`
    return `${decision.durationDays}天`
}

function DecisionCard({ decision }: { decision: AdjustmentDecision }) {
    if (decision.insufficient) {
        return (
            <section className={styles.decisionCard}>
                <div className={styles.cardHeader}>
                    <h2>{decision.level}级别</h2>
                    <span className={styles.insufficient}>数据不足</span>
                </div>
                <p className={styles.cardHint}>历史数据不足以判断最高点到最低点的调整。</p>
            </section>
        )
    }

    return (
        <section className={styles.decisionCard}>
            <div className={styles.cardHeader}>
                <h2>{decision.level}级别</h2>
                <span className={decision.passed ? styles.passed : styles.notPassed}>
                    {decision.passed ? '调整到位' : '调整未到位'}
                </span>
            </div>
            <div className={styles.metrics}>
                <div className={decision.passedByDrawdown ? styles.metricPassed : styles.metric}>
                    <span>调整幅度</span>
                    <strong>{formatPercent(decision.drawdown)}</strong>
                    <small>标准：≥ {decision.drawdownThreshold}%</small>
                </div>
                <div className={decision.passedByDuration ? styles.metricPassed : styles.metric}>
                    <span>调整时间</span>
                    <strong>{formatDuration(decision)}</strong>
                    <small>标准：≥ {decision.durationLabel}</small>
                </div>
            </div>
            <div className={styles.dateRow}>
                <span>最高点 {formatDate(decision.peakDate)}</span>
                <span>最低点 {formatDate(decision.troughDate)}</span>
            </div>
            <p className={styles.cardHint}>满足调整幅度或调整时间任一条件，即判断为调整到位。</p>
        </section>
    )
}

export default function DecisionRoute() {
    const navigate = useNavigate()
    const location = useLocation()
    const state = (location.state || null) as DecisionLocationState | null
    const symbol = String(state?.symbol || '').trim()
    const [history, setHistory] = useState<PriceHistory | null>(null)
    const [loading, setLoading] = useState(Boolean(symbol))
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!symbol) return
        const controller = new AbortController()
        setLoading(true)
        fetchPriceHistory(symbol, '1y', { signal: controller.signal })
            .then((next) => setHistory(next))
            .catch((reason: any) => {
                if (controller.signal.aborted) return
                setError(reason?.message || '历史行情加载失败')
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false)
            })
        return () => controller.abort()
    }, [symbol])

    const decisions = useMemo(() => {
        if (!history) return []
        return LEVELS.map((level) => evaluateAdjustment(history.candles as PriceCandle[], level))
    }, [history])

    useEffect(() => {
        if (error) Toast.show(error)
    }, [error])

    return (
        <div className={styles.page}>
            <NavBar onBack={() => navigate(-1)} className={styles.navBar}>
                决策分析
            </NavBar>
            <main className={styles.content}>
                <section className={styles.stockHeader}>
                    <span className={styles.stockName}>{state?.name || symbol || '未选择股票'}</span>
                    {symbol && <span className={styles.stockSymbol}>{symbol}</span>}
                </section>

                {!symbol ? (
                    <div className={styles.empty}>请先在购买页选择股票</div>
                ) : loading ? (
                    <div className={styles.loading}><SpinLoading color="currentColor" />加载历史行情</div>
                ) : history ? (
                    <>
                        <section className={styles.ruleCard}>
                            <h1>调整是否到位</h1>
                            <p>幅度和时间满足任一条件，即认为该级别调整到位。</p>
                            <div className={styles.ruleList}>
                                <span>日线：下跌 ≥ 5% 或持续 ≥ 2周</span>
                                <span>周线：下跌 ≥ 10% 或持续 ≥ 4周</span>
                                <span>月线：下跌 ≥ 15% 或持续 ≥ 4个月</span>
                            </div>
                        </section>
                        {decisions.map((decision) => <DecisionCard key={decision.level} decision={decision} />)}
                    </>
                ) : (
                    <div className={styles.empty}>暂时无法获取历史行情</div>
                )}
            </main>
        </div>
    )
}

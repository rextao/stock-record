import { useEffect, useMemo, useState } from 'react'
import { NavBar, Popup, SpinLoading, Toast } from 'antd-mobile'
import { Check, X } from 'lucide-react'
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

function formatDuration(decision: AdjustmentDecision): string {
    if (decision.durationDays == null) return '-'
    if (decision.durationUnit === '月') return `${decision.durationMonths}个月`
    if (decision.durationUnit === '周') return `${(decision.durationDays / 7).toFixed(1)}周`
    return `${decision.durationDays}天`
}

function LevelRow({ decision }: { decision: AdjustmentDecision }) {
    return (
        <div className={styles.levelRow}>
            <span className={styles.levelLabel}>{decision.level}</span>
            {decision.insufficient ? (
                <span className={styles.levelInsufficient}>数据不足</span>
            ) : (
                <>
                    <span className={decision.passedByDrawdown ? styles.checkPassed : styles.checkMissed}>
                        {decision.passedByDrawdown ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
                        {`${decision.drawdownThreshold}%`}
                    </span>
                    <span className={decision.passedByDuration ? styles.checkPassed : styles.checkMissed}>
                        {decision.passedByDuration ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
                        {formatDuration(decision)}
                    </span>
                </>
            )}
        </div>
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
    const [rulesVisible, setRulesVisible] = useState(false)

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

    const daily = decisions[0]

    return (
        <div className={styles.page}>
            <NavBar onBack={() => navigate(-1)} className={styles.navBar}>
                {symbol ? `决策分析 · ${symbol}` : '决策分析'}
            </NavBar>
            <main className={styles.content}>
                <section className={styles.stockHeader}>
                    <span className={styles.stockName}>{state?.name || symbol || '未选择股票'}</span>
                </section>

                {!symbol ? (
                    <div className={styles.empty}>请先在购买页选择股票</div>
                ) : loading ? (
                    <div className={styles.loading}><SpinLoading color="currentColor" />加载历史行情</div>
                ) : history ? (
                    <>
                        <section className={styles.decisionCard} onClick={() => setRulesVisible(true)}>
                            <div className={styles.cardHeader}>
                                <div className={styles.headerLeft}>
                                    <h2>调整情况</h2>
                                </div>
                                <span className={styles.currentAdjustment}>
                                    {daily && !daily.insufficient
                                        ? `${formatPercent(daily.drawdown)} · ${formatDuration(daily)}`
                                        : '--'}
                                </span>
                            </div>
                            {daily && !daily.insufficient && daily.peakDate && (
                                <div className={styles.calcBase}>
                                    起算 {daily.peakDate} · {daily.peakPrice?.toFixed(2)}
                                </div>
                            )}
                            <div className={styles.levelList}>
                                {decisions.map((decision) => <LevelRow key={decision.level} decision={decision} />)}
                            </div>
                        </section>
                        {rulesVisible && (
                            <Popup
                                visible
                                bodyClassName={styles.rulesBody}
                                onMaskClick={() => setRulesVisible(false)}
                            >
                                <div className={styles.rulesHeader}>
                                    <h3>判定规则</h3>
                                    <X size={20} className={styles.rulesClose} onClick={() => setRulesVisible(false)} />
                                </div>
                                <div className={styles.ruleList}>
                                    <span>日线：下跌 ≥ 5% 或持续 ≥ 2周（14天）</span>
                                    <span>周线：下跌 ≥ 10% 或持续 ≥ 4周（28天）</span>
                                    <span>月线：下跌 ≥ 15% 或持续 ≥ 4个月</span>
                                </div>
                            </Popup>
                        )}
                    </>
                ) : (
                    <div className={styles.empty}>暂时无法获取历史行情</div>
                )}
            </main>
        </div>
    )
}

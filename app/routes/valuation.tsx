import { useEffect, useState } from 'react'
import { SpinLoading, Toast } from 'antd-mobile'
import { RefreshCw } from 'lucide-react'
import { fetchMarketValuation } from '~/api/marketValuation'
import ValuationCurveChart from '~/features/market-valuation/ValuationCurveChart'
import { getValuationStats, getValuationStatus } from '~/features/market-valuation/stats'
import type { MarketValuation } from '~/features/market-valuation/types'
import styles from './valuation.module.less'

export default function ValuationRoute() {
    const [data, setData] = useState<MarketValuation | null>(null)
    const [loading, setLoading] = useState(true)
    const [rangeYears, setRangeYears] = useState(10)

    useEffect(() => {
        const controller = new AbortController()
        fetchMarketValuation({ signal: controller.signal })
            .then((next) => setData(next))
            .catch((error: any) => {
                if (!controller.signal.aborted) Toast.show(error?.message || '估值数据加载失败')
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false)
            })
        return () => controller.abort()
    }, [])

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>估值</h1>
                </div>
                <button type="button" className={styles.refreshButton} onClick={() => window.location.reload()} aria-label="刷新估值数据">
                    <RefreshCw size={18} />
                </button>
            </div>

            {loading ? (
                <div className={styles.loading}><SpinLoading color="currentColor" />加载估值数据</div>
            ) : data ? (
                <div className={styles.content}>
                    <div className={styles.rangeBar} aria-label="估值图表时间范围">
                        {[10, 5, 3].map((option) => (
                            <button
                                type="button"
                                key={option}
                                className={option === rangeYears ? styles.rangeButtonActive : styles.rangeButton}
                                onClick={() => setRangeYears(option)}
                            >
                                {option}年
                            </button>
                        ))}
                    </div>
                    {data.series.map((item) => (
                        <ValuationCard
                            key={item.id}
                            series={item}
                            rangeYears={rangeYears}
                        />
                    ))}
                </div>
            ) : (
                <div className={styles.empty}>暂时无法获取估值数据</div>
            )}
        </div>
    )
}

function ValuationCard({
    series,
    rangeYears,
}: {
    series: MarketValuation['series'][number]
    rangeYears: number
}) {
    const stats = getValuationStats(series, rangeYears)
    const status = getValuationStatus(stats)

    return (
        <section className={styles.valuationCard}>
            <div className={styles.cardHeader}>
                <div className={styles.titleRow}>
                    <h2 className={styles.cardTitle}>{series.name}</h2>
                    <span
                        className={`${styles.status} ${status === '高估' ? styles.statusHigh : status === '低估' ? styles.statusLow : styles.statusFair}`}
                    >
                        {status}
                    </span>
                </div>
            </div>
            <div className={styles.valueRow}>
                <strong className={styles.value}>{series.current == null ? '--' : `${series.current.toFixed(1)}倍`}</strong>
                <span className={styles.valueStats}>（最低 {stats.min.toFixed(2)} · 平均 {stats.average.toFixed(2)} · 最高 {stats.max.toFixed(2)}）</span>
            </div>
            <ValuationCurveChart series={series} rangeYears={rangeYears} />
        </section>
    )
}

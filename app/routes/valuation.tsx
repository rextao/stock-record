import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { SpinLoading, Toast } from 'antd-mobile'
import { RefreshCw } from 'lucide-react'
import { fetchMarketValuation } from '~/api/marketValuation'
import ValuationCurveChart from '~/features/market-valuation/ValuationCurveChart'
import type { MarketValuation } from '~/features/market-valuation/types'
import styles from './valuation.module.less'

export default function ValuationRoute() {
    const navigate = useNavigate()
    const [data, setData] = useState<MarketValuation | null>(null)
    const [loading, setLoading] = useState(true)

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
                    <div className={styles.subtitle}>大盘前向市盈率</div>
                </div>
                <button type="button" className={styles.refreshButton} onClick={() => window.location.reload()} aria-label="刷新估值数据">
                    <RefreshCw size={18} />
                </button>
            </div>

            {loading ? (
                <div className={styles.loading}><SpinLoading color="currentColor" />加载估值数据</div>
            ) : data ? (
                <div className={styles.content}>
                    {data.series.map((item) => (
                        <section className={styles.valuationCard} key={item.id}>
                            <div className={styles.cardHeader}>
                                <div>
                                    <h2 className={styles.cardTitle}>{item.name}前瞻市盈率</h2>
                                    <strong className={styles.value}>{item.current == null ? '--' : `${item.current.toFixed(1)}倍`}</strong>
                                </div>
                                <span className={styles.valueDate}>更新于 {item.updated}</span>
                            </div>
                            <ValuationCurveChart series={item} />
                            <button type="button" className={styles.historyButton} onClick={() => navigate(`/valuation/${item.id}`)}>
                                查看历史数据
                            </button>
                        </section>
                    ))}
                    <div className={styles.note}>前向市盈率为未来12个月一致预期口径，数据按周更新。</div>
                    <a className={styles.source} href="https://historyofmarket.com/" target="_blank" rel="noreferrer">
                        数据来源：History of Market
                    </a>
                </div>
            ) : (
                <div className={styles.empty}>暂时无法获取估值数据</div>
            )}
        </div>
    )
}

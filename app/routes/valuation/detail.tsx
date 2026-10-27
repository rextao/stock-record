import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { NavBar, SpinLoading, Toast } from 'antd-mobile'
import { fetchMarketValuation } from '~/api/marketValuation'
import ValuationCurveChart from '~/features/market-valuation/ValuationCurveChart'
import type { MarketValuationSeries } from '~/features/market-valuation/types'
import styles from './detail.module.less'

export default function ValuationDetailRoute() {
    const navigate = useNavigate()
    const { id } = useParams()
    const [series, setSeries] = useState<MarketValuationSeries | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const controller = new AbortController()
        fetchMarketValuation({ signal: controller.signal })
            .then((data) => setSeries(data.series.find((item) => item.id === id) || null))
            .catch((error: any) => {
                if (!controller.signal.aborted) Toast.show(error?.message || '估值数据加载失败')
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false)
            })
        return () => controller.abort()
    }, [id])

    return (
        <div className={styles.page}>
            <NavBar onBack={() => navigate(-1)} className={styles.navBar}>
                {series ? `${series.name}前瞻市盈率` : '估值历史'}
            </NavBar>
            {loading ? (
                <div className={styles.loading}><SpinLoading color="currentColor" />加载历史数据</div>
            ) : series ? (
                <div className={styles.content}>
                    <div className={styles.summary}>
                        <span>当前前向市盈率</span>
                        <strong>{series.current == null ? '--' : `${series.current.toFixed(1)}倍`}</strong>
                    </div>
                    <div className={styles.chartCard}>
                        <ValuationCurveChart series={series} rangeYears={null} />
                    </div>
                    <div className={styles.tableCard}>
                        <div className={styles.tableTitle}>历史数据</div>
                        <div className={styles.tableHeader}><span>日期</span><span>前向市盈率</span></div>
                        {[...series.points].reverse().map((point) => (
                            <div className={styles.tableRow} key={point.date}>
                                <span>{point.date}</span>
                                <span>{point.value.toFixed(2)}倍</span>
                            </div>
                        ))}
                    </div>
                    <div className={styles.note}>数据来源：History of Market，前向市盈率为未来12个月一致预期口径。</div>
                </div>
            ) : (
                <div className={styles.empty}>未找到该指数的历史数据</div>
            )}
        </div>
    )
}

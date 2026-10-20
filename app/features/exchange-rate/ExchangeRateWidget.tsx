import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronRight, RefreshCw } from 'lucide-react'
import {
    fetchDailyExchangeRate,
    formatRmbAmount,
    formatUsdAmount,
    readExchangeRateSettings,
    writeExchangeRateSettings,
    type ExchangeRateSettings,
} from './exchangeRate'
import styles from './ExchangeRateWidget.module.less'

export default function ExchangeRateWidget() {
    const navigate = useNavigate()
    const [settings, setSettings] = useState<ExchangeRateSettings>(() => readExchangeRateSettings())

    useEffect(() => {
        let active = true
        fetchDailyExchangeRate(settings).then((next) => {
            if (!active) return
            setSettings(next)
            writeExchangeRateSettings(next)
        })
        return () => {
            active = false
        }
    }, [])

    return (
        <button type="button" className={styles.widget} onClick={() => navigate('/tools/exchange-rate')}>
            <div className={styles.header}>
                <span className={styles.title}>汇率换算</span>
                <span className={styles.rateHint}>
                    {settings.snapshot ? `1 USD = ${settings.snapshot.rate.toFixed(4)} CNY` : '汇率加载中'}
                    <ChevronRight size={15} aria-hidden />
                </span>
            </div>
            <div className={styles.rows}>
                {settings.amounts.map((amount) => (
                    <div className={styles.row} key={amount}>
                        <span className={styles.rmb}>¥{formatRmbAmount(amount)}</span>
                        <span className={styles.equals}>=</span>
                        <span className={styles.usd}>
                            {settings.snapshot ? `$${formatUsdAmount(amount / settings.snapshot.rate)}` : '--'}
                        </span>
                    </div>
                ))}
            </div>
            {!settings.snapshot && <div className={styles.errorHint}><RefreshCw size={13} />暂无汇率数据</div>}
        </button>
    )
}

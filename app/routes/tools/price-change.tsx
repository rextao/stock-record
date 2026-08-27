import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { NavBar, Input } from 'antd-mobile'
import { ArrowDownUp } from 'lucide-react'
import clsx from 'clsx'
import { calcPriceChange, formatPct, formatSignedAmount } from '~/utils/calculations'
import { DECIMAL_INPUT_PROPS, sanitizeDecimalInput } from '~/utils/numberInput'
import styles from './price-change.module.less'

/**
 * 涨跌幅计算器：输入起始价与目标价，算出涨跌幅、差值和倍数。
 * 纯本地计算，不碰 /api，因此离线时也完全可用。
 */
export default function PriceChangeRoute() {
    const navigate = useNavigate()
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')

    // Number('') 是 0，会算出一个看似合理的结果，所以先按原始字符串判空
    const filled = from.trim() !== '' && to.trim() !== ''
    const change = useMemo(
        () => (filled ? calcPriceChange(Number(from), Number(to)) : null),
        [filled, from, to],
    )

    const toneClass = (value: number) =>
        value > 0 ? styles.up : value < 0 ? styles.down : undefined

    const swap = () => {
        setFrom(to)
        setTo(from)
    }

    return (
        <div className={styles.page}>
            <NavBar onBack={() => navigate(-1)} className={styles.navBar}>
                涨跌幅计算
            </NavBar>

            <div className={styles.content}>
                <div className={styles.form}>
                    <PriceField label="起始价" value={from} onChange={setFrom} />

                    <button type="button" className={styles.swapButton} onClick={swap} title="交换两个价格">
                        <ArrowDownUp size={16} />
                    </button>

                    <PriceField label="目标价" value={to} onChange={setTo} />
                </div>

                <div className={styles.result}>
                    <div className={clsx(styles.resultPct, change && toneClass(change.pct))}>
                        {change ? formatPct(change.pct) : '--'}
                    </div>
                    <div className={styles.resultHint}>目标价相对起始价的涨跌幅</div>

                    <div className={styles.metrics}>
                        <Metric
                            label="差值"
                            value={change ? formatSignedAmount(change.diff) : '--'}
                            className={change ? toneClass(change.diff) : undefined}
                        />
                        <Metric label="倍数" value={change ? `${change.ratio.toFixed(4)}x` : '--'} />
                    </div>
                </div>
            </div>
        </div>
    )
}

function PriceField({
    label,
    value,
    onChange,
}: {
    label: string
    value: string
    onChange: (next: string) => void
}) {
    return (
        <div className={styles.field}>
            <div className={styles.fieldLabel}>{label}</div>
            <div className={styles.fieldBox}>
                <Input
                    {...DECIMAL_INPUT_PROPS}
                    value={value}
                    onChange={(next) => onChange(sanitizeDecimalInput(next))}
                    placeholder="0.00"
                    className={styles.fieldInput}
                />
            </div>
        </div>
    )
}

function Metric({
    label,
    value,
    className,
}: {
    label: string
    value: string
    className?: string
}) {
    return (
        <div className={styles.metric}>
            <span className={styles.metricLabel}>{label}</span>
            <span className={clsx(styles.metricValue, className)}>{value}</span>
        </div>
    )
}

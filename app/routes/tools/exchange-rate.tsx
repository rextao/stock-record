import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { NavBar } from 'antd-mobile'
import { Plus, Trash2 } from 'lucide-react'
import NumericKeypad from '~/common/components/NumericKeypad'
import {
    fetchDailyExchangeRate,
    formatRmbAmount,
    readExchangeRateSettings,
    writeExchangeRateSettings,
    MAX_EXCHANGE_AMOUNTS,
    type ExchangeRateSettings,
} from '~/features/exchange-rate/exchangeRate'
import styles from './exchange-rate.module.less'

export default function ExchangeRateRoute() {
    const navigate = useNavigate()
    const [settings, setSettings] = useState<ExchangeRateSettings>(() => readExchangeRateSettings())
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

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

    const updateAmounts = (amounts: number[]) => {
        const next = { ...settings, amounts }
        setSettings(next)
        writeExchangeRateSettings(next)
    }

    const inputDigit = (char: string) => {
        if (selectedIndex == null) return
        const current = String(settings.amounts[selectedIndex] ?? '')
        const nextValue = current === '0' ? char : `${current}${char}`
        const amount = Number(nextValue)
        if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999) return
        updateAmounts(settings.amounts.map((value, index) => (index === selectedIndex ? amount : value)))
    }

    const backspace = () => {
        if (selectedIndex == null) return
        const current = String(settings.amounts[selectedIndex] ?? '')
        const next = current.slice(0, -1)
        if (!next) return
        updateAmounts(settings.amounts.map((value, index) => (index === selectedIndex ? Number(next) : value)))
    }

    const addAmount = () => {
        if (settings.amounts.length >= MAX_EXCHANGE_AMOUNTS) return
        updateAmounts([...settings.amounts, 10000])
    }

    const removeAmount = (index: number) => {
        const next = settings.amounts.filter((_, itemIndex) => itemIndex !== index)
        updateAmounts(next)
        setSelectedIndex(null)
    }

    return (
        <div className={styles.page}>
            <NavBar onBack={() => navigate(-1)} className={styles.navBar}>汇率换算</NavBar>
            <div className={styles.content}>
                <div className={styles.sectionTitle}>首页显示金额</div>
                <div className={styles.card}>
                    {settings.amounts.map((amount, index) => (
                        <div className={styles.amountRow} key={`${index}-${amount}`}>
                            <button
                                type="button"
                                className={styles.amountButton}
                                onPointerDown={(event) => event.preventDefault()}
                                onClick={() => setSelectedIndex(index)}
                            >
                                <span className={styles.amountIndex}>{index + 1}</span>
                                <span className={styles.amountValue}>{formatRmbAmount(amount)} 元</span>
                            </button>
                            <button type="button" className={styles.deleteButton} onClick={() => removeAmount(index)} aria-label={`删除第${index + 1}条金额`}>
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                    <button type="button" className={styles.addButton} onClick={addAmount} disabled={settings.amounts.length >= MAX_EXCHANGE_AMOUNTS}>
                        <Plus size={18} />
                        {settings.amounts.length >= MAX_EXCHANGE_AMOUNTS ? '最多添加5条' : '新增金额'}
                    </button>
                </div>
                <div className={styles.hint}>点击金额后使用数字键盘修改，首页会按当前配置显示。</div>
            </div>
            <NumericKeypad
                visible={selectedIndex != null}
                allowDecimal={false}
                canPrev={selectedIndex != null && selectedIndex > 0}
                canNext={selectedIndex != null && selectedIndex < settings.amounts.length - 1}
                onInput={inputDigit}
                onBackspace={backspace}
                onPrev={() => setSelectedIndex((index) => (index == null ? null : Math.max(0, index - 1)))}
                onNext={() => setSelectedIndex((index) => (index == null ? null : Math.min(settings.amounts.length - 1, index + 1)))}
                onDone={() => setSelectedIndex(null)}
            />
        </div>
    )
}

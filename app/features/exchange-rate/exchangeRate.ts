export const EXCHANGE_RATE_STORAGE_KEY = 'stock-record:exchange-rate'
export const MAX_EXCHANGE_AMOUNTS = 5

export type ExchangeRateSnapshot = {
    rate: number
    fetchedDate: string
}

export type ExchangeRateSettings = {
    amounts: number[]
    snapshot: ExchangeRateSnapshot | null
    lastAttemptDate: string | null
}

const DEFAULT_AMOUNTS: number[] = []

export function getTodayKey(date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date)
}

export function readExchangeRateSettings(): ExchangeRateSettings {
    if (typeof window === 'undefined') return { amounts: DEFAULT_AMOUNTS, snapshot: null, lastAttemptDate: null }
    try {
        const raw = window.localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY)
        if (!raw) return { amounts: DEFAULT_AMOUNTS, snapshot: null, lastAttemptDate: null }
        const value = JSON.parse(raw) as Partial<ExchangeRateSettings>
        const amounts = Array.isArray(value.amounts)
            ? value.amounts
                  .map(Number)
                  .filter((amount) => Number.isFinite(amount) && amount > 0)
                  .slice(0, MAX_EXCHANGE_AMOUNTS)
            : []
        const snapshot = value.snapshot
        return {
            amounts: Array.isArray(value.amounts) ? amounts : DEFAULT_AMOUNTS,
            snapshot:
                snapshot && Number.isFinite(Number(snapshot.rate)) && Number(snapshot.rate) > 0 && typeof snapshot.fetchedDate === 'string'
                    ? { rate: Number(snapshot.rate), fetchedDate: snapshot.fetchedDate }
                    : null,
            lastAttemptDate: typeof value.lastAttemptDate === 'string' ? value.lastAttemptDate : null,
        }
    } catch {
        return { amounts: DEFAULT_AMOUNTS, snapshot: null, lastAttemptDate: null }
    }
}

export function writeExchangeRateSettings(settings: ExchangeRateSettings): void {
    window.localStorage.setItem(EXCHANGE_RATE_STORAGE_KEY, JSON.stringify(settings))
}

export function formatRmbAmount(amount: number): string {
    if (amount >= 10000) {
        const value = amount / 10000
        return `${Number.isInteger(value) ? value : value.toFixed(1).replace(/\.0$/, '')}w`
    }
    return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(amount)
}

export function formatUsdAmount(amount: number): string {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(amount))
}

export async function fetchDailyExchangeRate(settings: ExchangeRateSettings): Promise<ExchangeRateSettings> {
    const today = getTodayKey()
    if (settings.lastAttemptDate === today) return settings

    try {
        const response = await fetch('https://api.frankfurter.dev/v2/rate/USD/CNY', {
            headers: { Accept: 'application/json' },
        })
        if (!response.ok) throw new Error(`Exchange rate request failed: ${response.status}`)
        const data = (await response.json()) as { rate?: number }
        const rate = Number(data.rate)
        if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid exchange rate')
        return { ...settings, snapshot: { rate, fetchedDate: today }, lastAttemptDate: today }
    } catch {
        return { ...settings, lastAttemptDate: today }
    }
}

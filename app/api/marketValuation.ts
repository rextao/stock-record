import type { MarketValuation } from '~/features/market-valuation/types'
import { reportRequestNetworkFailure } from '../common/network/connectionStore'

export async function fetchMarketValuation(options: { signal?: AbortSignal } = {}): Promise<MarketValuation> {
    let response: Response
    try {
        response = await fetch('/api/market-valuation', {
            signal: options.signal,
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
        })
    } catch (error) {
        if (!options.signal?.aborted) reportRequestNetworkFailure()
        throw error
    }

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error || `请求失败（${response.status}）`)
    }
    return payload as MarketValuation
}

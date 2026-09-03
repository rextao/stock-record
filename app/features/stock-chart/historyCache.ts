import type { HistoryRange, PriceHistory } from './types'

/**
 * 走势图的进程内内存缓存：切区间、来回进出走势页都直接复用，不再打 `/api/history`。
 *
 * 刻意只放在内存里（模块级变量），不落 localStorage / IndexedDB：
 * - 生命周期正好是「这次 PWA 会话」—— 刷新页面或系统回收后台进程就干净了，
 *   不用操心版本迁移、配额、以及「上次那条曲线到底存在哪一层」的排查成本；
 * - 放在组件 state 里不够用：从走势页返回首页会卸载组件，再进来又得重拉一次。
 *
 * Worker 侧已经有 1 小时的边缘缓存，所以这层省下的不是上游请求，而是每次切区间的
 * 那一趟网络往返和骨架屏闪动。
 */

/**
 * 缓存有效期。服务端边缘缓存是 1 小时，这里刻意取得更短：过期后重新请求大概率还是
 * 命中边缘缓存（几毫秒、不打 Yahoo），代价很小，但万一服务端那份已经刷新过，
 * 开着 App 不动的人也能等到新数据。
 */
const TTL_MS = 10 * 60 * 1000

/**
 * 最多留多少条 (标的 × 区间)。不退出 PWA 就一直驻留，得有个上限兜住无界增长；
 * 一条 1 年日线约 250 个点，24 条量级在几百 KB，够一次浏览会话来回切了。
 */
const MAX_ENTRIES = 24

interface CacheEntry {
    /** 本地写入时刻 */
    storedAt: number
    value: PriceHistory
}

// 插入顺序即最近使用顺序：命中时删掉再塞回队尾，淘汰从队首开始
const entries = new Map<string, CacheEntry>()

const keyOf = (symbol: string, range: HistoryRange) => `${symbol.trim().toUpperCase()}|${range}`

export function readHistoryCache(symbol: string, range: HistoryRange): PriceHistory | null {
    if (!symbol) return null
    const key = keyOf(symbol, range)
    const hit = entries.get(key)
    if (!hit) return null
    // 过期判断用本地写入时刻，**不能用 PriceHistory.fetchedAt**：上游限流时服务端会拿
    // D1 里的旧曲线兜底、fetchedAt 是当初抓取的时刻（可能是几天前），用它判断等于缓存永远
    // 过期，越被限流越频繁地回头打上游。
    if (Date.now() - hit.storedAt > TTL_MS) {
        entries.delete(key)
        return null
    }
    entries.delete(key)
    entries.set(key, hit)
    return hit.value
}

export function writeHistoryCache(symbol: string, range: HistoryRange, value: PriceHistory): void {
    // 空曲线不缓存，与服务端口径一致：那通常是限流或封 IP，缓存住会让用户在整个 TTL 内都看不到图
    if (!symbol || value.candles.length === 0) return
    const key = keyOf(symbol, range)
    entries.delete(key)
    entries.set(key, { storedAt: Date.now(), value })
    while (entries.size > MAX_ENTRIES) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
    }
}

/** 手动重试/刷新时清掉这一条，让它真的重新走网络 */
export function invalidateHistoryCache(symbol: string, range: HistoryRange): void {
    if (!symbol) return
    entries.delete(keyOf(symbol, range))
}

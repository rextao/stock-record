import type { HoldingCardWithPrice, TradeWithItem } from './types'

/**
 * trade-record 的进程内会话缓存（照搬 stock-chart/historyCache 的思路）：
 * 首页持仓列表、图表交易列表、以及首页卡片的单标的报价，都在这里做「切 Tab 秒开 +
 * 后台重新校验」(SWR)。刻意只放内存（模块级变量），不落 localStorage / IndexedDB ——
 * 生命周期正好是「这次 PWA 会话」，刷新页面或系统回收后台进程就干净了，不用操心版本
 * 迁移、配额，以及「上次那份到底存在哪一层」的排查成本。
 *
 * 为什么在应用层做 SWR、而不是在 Service Worker 层：SW 对 /api 刻意用 NetworkFirst、
 * 且把 /api/quotes 排除在外（见 sw/sw.ts 注释）—— 那层不该先渲染过期报价。应用层这层
 * 把「过期风险」关进两格，都能兜住：
 *   1. 结构（持仓 / 交易列表）：用户每次写操作后由 api/trading.ts 精确失效，且每次进
 *      页面都后台重拉，首屏那帧最多旧一下、马上被新数据纠正，不会长期失真；
 *   2. 报价：复用首页卡片已有的「超 5 分钟标黄 + 后台刷新」机制，旧价只是标黄提示，
 *      不会被当成新鲜数据。
 */

// ========== 列表结构缓存（持仓 / 交易）==========
// 首屏用来「秒开」的兜底；真正的新鲜度靠页面挂载时的后台重拉保证，所以 TTL 只是长时间
// 空置后第一帧的保护，取值与 historyCache 对齐（10 分钟）。
const LIST_TTL_MS = 10 * 60 * 1000

interface ListEntry<T> {
    /** 本地写入时刻 */
    storedAt: number
    value: T
}

let holdingsEntry: ListEntry<HoldingCardWithPrice[]> | null = null
let tradesEntry: ListEntry<TradeWithItem[]> | null = null

function readList<T>(entry: ListEntry<T> | null): T | null {
    if (!entry) return null
    if (Date.now() - entry.storedAt > LIST_TTL_MS) return null
    return entry.value
}

export function readHoldingsCache(): HoldingCardWithPrice[] | null {
    return readList(holdingsEntry)
}

export function writeHoldingsCache(value: HoldingCardWithPrice[]): void {
    holdingsEntry = { storedAt: Date.now(), value }
}

export function readTradesCache(): TradeWithItem[] | null {
    return readList(tradesEntry)
}

export function writeTradesCache(value: TradeWithItem[]): void {
    tradesEntry = { storedAt: Date.now(), value }
}

/**
 * 用户改了数据（加仓 / 卖出 / 改成交时间 / 删条目…）后清掉结构缓存，让下次进页面从零
 * 重拉、首屏不再拿旧结构垫。市场报价与用户买卖无关，不在这里清（见下方报价缓存）。
 */
export function invalidateTradingListCaches(): void {
    holdingsEntry = null
    tradesEntry = null
}

// ========== 单标的报价缓存 ==========
// 服务端 /api/holdings 现在只回结构（live_price 恒为 null），报价由首页卡片各自补。
// 这层让来回切 Tab 时价格也能秒回上次那份，配合卡片「超 5 分钟标黄」判断决定要不要
// 后台再拉。失败不写：与服务端「失败报价不缓存」口径一致，下次挂载会自动重试。
export interface CachedQuote {
    price: number | null
    fetchedAt: number | null
    error: string | null
}

const quotes = new Map<string, CachedQuote>()
const quoteKey = (symbol: string) => symbol.trim().toUpperCase()

export function readQuoteCache(symbol: string): CachedQuote | null {
    if (!symbol) return null
    return quotes.get(quoteKey(symbol)) ?? null
}

export function writeQuoteCache(symbol: string, quote: CachedQuote): void {
    if (!symbol || quote.price == null) return
    quotes.set(quoteKey(symbol), quote)
}

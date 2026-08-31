import {
    RANGE_INTERVALS,
    type HistoryRange,
    type PriceHistory,
} from "../../../../../app/features/stock-chart/types";
import type { IStockHistoryService } from "./types";
import { YahooHistoryProvider } from "./yahoo";
import { CandleStore, type StoredWindow } from "./store";
import { createCache } from "../../../cache";
import { getConfig } from "../../../config";

const DAY_MS = 86_400_000;

/**
 * 各区间回看多久（毫秒）。刻意比字面值宽一点：Yahoo 的 range 按自然日算，
 * 5d 里夹着周末，卡到正好 5 天会把最早那根裁掉。
 */
const RANGE_LOOKBACK_MS: Record<Exclude<HistoryRange, "ytd">, number> = {
    "5d": 7 * DAY_MS,
    "1mo": 31 * DAY_MS,
    "3mo": 92 * DAY_MS,
    "6mo": 183 * DAY_MS,
    "1y": 366 * DAY_MS,
};

// 判断本地数据是否覆盖到窗口起点时的宽容度：新上市的标的、长假都会让最早一根晚于窗口起点，
// 卡死会导致每次看图都白打一次上游
const COVERAGE_SLACK_MS = 7 * DAY_MS;

function windowStart(range: HistoryRange, now: number): number {
    if (range === "ytd") return Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
    return now - RANGE_LOOKBACK_MS[range];
}

/**
 * 历史行情服务工厂。三层：两级缓存（热路径，命中就完全不碰 D1）→ D1 本地副本 → Yahoo。
 *
 * D1 这层的价值不是省流量，而是「上游 429 时还能看到曲线」：收盘后的 K 线不再变化，
 * 抓到一次就永久有效，限流最多影响今天那个点。
 */
export function getStockHistoryService(env: any): IStockHistoryService {
    const config = getConfig(env);
    const provider = new YahooHistoryProvider();
    const cache = createCache("stock-history:yahoo");
    const store: CandleStore | null = env?.DB ? new CandleStore(env.DB) : null;

    // D1 只是加速与兜底：表还没建（线上未跑 migration）时不能让看图整体失败，
    // 所以读写都吞掉异常，退化成「每次都打上游」的老行为
    const readStore = async (symbol: string, interval: string, since: number): Promise<StoredWindow | null> => {
        if (!store) return null;
        try {
            return await store.read(symbol, interval, since);
        } catch (error) {
            console.warn("[history] read from D1 failed", error);
            return null;
        }
    };

    const load = async (symbol: string, range: HistoryRange): Promise<PriceHistory> => {
        const interval = RANGE_INTERVALS[range] ?? "1d";
        const now = Date.now();
        const since = windowStart(range, now);
        const stored = await readStore(symbol, interval, since);

        const fresh = stored && stored.fetchedAt >= now - config.cache.historyTtlSeconds * 1000;
        const covered = stored && stored.oldestTs <= since + COVERAGE_SLACK_MS;
        // 本地行缺 OHLC（是这次改动之前写进去的）时不走短路：K 线模式画不出来，
        // 得打一次上游把整段重写补齐，一次性自愈，不搞手工 migration
        const needsOhlcBackfill = stored ? stored.candles.some((candle) => typeof candle.o !== "number") : false;
        if (stored && fresh && covered && !needsOhlcBackfill && stored.candles.length > 0) {
            return toHistory(symbol, range, stored);
        }

        try {
            const series = await provider.getCloses(symbol, range);
            if (store && series.candles.length > 0) {
                try {
                    await store.save(symbol, interval, series, stored, now, needsOhlcBackfill);
                } catch (error) {
                    // 落库失败只影响下次的兜底能力，不该让这次看图失败
                    console.warn("[history] save to D1 failed", error);
                }
            }
            return {
                symbol,
                range,
                candles: series.candles,
                utcOffsetSeconds: series.utcOffsetSeconds,
                fetchedAt: now,
            };
        } catch (error) {
            // 上游挂了或限流：本地有多少就先给多少，宁可曲线旧一点也别给错误页。
            // fetchedAt 仍是当初抓取的时刻，前端据此就知道数据有多旧
            if (stored && stored.candles.length > 0) return toHistory(symbol, range, stored);
            throw error;
        }
    };

    return {
        getHistory(symbol: string, range: HistoryRange): Promise<PriceHistory> {
            const normalized = symbol.trim().toUpperCase();
            return cache.wrap<PriceHistory>(
                // v2：candle 加了时间戳字段，旧缓存的形状对不上，必须换 key
                ["series", "v2", normalized, range],
                {
                    ttlSeconds: config.cache.historyTtlSeconds,
                    // 空序列不缓存：可能是限流或封 IP，缓存住会让用户在整个 TTL 内都看不到曲线
                    shouldCache: (history) => history.candles.length > 0,
                },
                () => load(normalized, range),
            );
        },
    };
}

function toHistory(symbol: string, range: HistoryRange, stored: StoredWindow): PriceHistory {
    return {
        symbol,
        range,
        candles: stored.candles,
        utcOffsetSeconds: stored.utcOffsetSeconds,
        fetchedAt: stored.fetchedAt,
    };
}

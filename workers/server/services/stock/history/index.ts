import type { HistoryRange, PriceHistory } from "../../../../../app/features/stock-chart/types";
import type { IStockHistoryService } from "./types";
import { YahooHistoryProvider } from "./yahoo";
import { createCache } from "../../../cache";
import { getConfig } from "../../../config";

/**
 * 历史行情服务工厂。缓存复用通用的两级缓存（内存 + Cache API）。
 * 收盘后数据就不再变化，TTL 可以比报价长得多，默认 1 小时。
 */
export function getStockHistoryService(env: any): IStockHistoryService {
    const config = getConfig(env);
    const provider = new YahooHistoryProvider();
    const cache = createCache("stock-history:yahoo");

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
                async () => {
                    const series = await provider.getCloses(normalized, range);
                    return {
                        symbol: normalized,
                        range,
                        candles: series.candles,
                        utcOffsetSeconds: series.utcOffsetSeconds,
                        fetchedAt: Date.now(),
                    };
                },
            );
        },
    };
}

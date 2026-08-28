import { RANGE_INTERVALS, type HistoryRange, type PriceCandle } from "../../../../../app/features/stock-chart/types";
import type { IStockHistoryProvider, PriceSeries } from "./types";

/**
 * Yahoo Finance 的图表接口。免 key、免注册，日线和小时线都够用。
 *
 * 代价要清楚：这是非公开接口，没有 SLA，字段结构随时可能变，且它会按出口 IP 拒绝流量 ——
 * 本机 curl 通不代表 Cloudflare Workers 里通。取不到数据时一律抛错，让上层返回 502
 * （异常结果既不写服务端缓存，也不会被 Service Worker 当正常响应回放）。
 */
export class YahooHistoryProvider implements IStockHistoryProvider {
    private baseUrl = "https://query1.finance.yahoo.com/v8/finance/chart";

    async getCloses(symbol: string, range: HistoryRange): Promise<PriceSeries> {
        const interval = RANGE_INTERVALS[range] ?? "1d";
        const url = `${this.baseUrl}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                // 不带常规 UA 时 Yahoo 会直接回 429/403
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            },
        });

        if (!response.ok) {
            // 404 是「这个代码 Yahoo 不认识」，与限流、封 IP 是两种问题，前端文案要分开
            throw new Error(response.status === 404 ? "NO_HISTORY" : "HISTORY_UPSTREAM_ERROR");
        }

        const data = (await response.json()) as any;
        const result = data?.chart?.result?.[0];
        if (!result) throw new Error("NO_HISTORY");

        // 交易所时区偏移：日期折算和前端的时间标签都要用它
        const offset = typeof result.meta?.gmtoffset === "number" ? result.meta.gmtoffset : 0;

        const stamps: unknown[] = Array.isArray(result.timestamp) ? result.timestamp : [];
        // adjclose 在有拆股/分红时才是连续的曲线，没有它再退回原始收盘价
        const adjusted = result.indicators?.adjclose?.[0]?.adjclose;
        const raw = result.indicators?.quote?.[0]?.close;
        const closes: unknown[] = Array.isArray(adjusted) ? adjusted : Array.isArray(raw) ? raw : [];

        const candles: PriceCandle[] = [];
        for (let i = 0; i < stamps.length; i++) {
            const stamp = stamps[i];
            const close = closes[i];
            // 停牌 / 无成交的交易日 Yahoo 会给 null，跳过而不是补 0
            if (typeof stamp !== "number" || typeof close !== "number" || !Number.isFinite(close)) continue;
            candles.push({ date: toYmd(stamp, offset), t: stamp * 1000, close });
        }
        return { candles, utcOffsetSeconds: offset };
    }
}

/**
 * 时间戳折算成「交易所当地」的交易日。
 *
 * 不能直接取 UTC 日期：美股日线的 timestamp 是开盘时刻（UTC 13:30/14:30）碰巧同日，
 * 但小时线里收盘那根、以及亚洲市场的标的都会偏一天。加上 gmtoffset 再取 UTC 字段才稳。
 */
function toYmd(epochSeconds: number, offsetSeconds: number): string {
    return new Date((epochSeconds + offsetSeconds) * 1000).toISOString().slice(0, 10);
}

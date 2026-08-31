import type { PriceCandle } from "../../../../../app/features/stock-chart/types";
import type { PriceSeries } from "./types";

/** 从 D1 读回的一个区间窗口。oldest/newest 是该 (symbol, interval) 的全局水位，不是窗口内的 */
export interface StoredWindow {
    candles: PriceCandle[];
    utcOffsetSeconds: number;
    fetchedAt: number;
    oldestTs: number;
    newestTs: number;
}

// 每行 INSERT 带 8 个绑定参数，D1 单条语句的参数上限是 100，留足余量
const ROWS_PER_STATEMENT = 10;

/**
 * 历史行情的 D1 持久化。刻意不放进 TradingDB：那是交易域的仓储，
 * 这张表属于行情服务的实现细节（换数据源、换粒度都只动这里）。
 *
 * 免费额度的两条红线决定了这里的写法：
 * 1) rows read 500 万/天，且计的是「扫描行数」—— 所有查询都必须走复合主键索引；
 * 2) rows written 10 万/天 —— 所以刷新时只写「比水位新」和「比水位旧」的点，
 *    不做整段 upsert。否则 20 个标的每小时重写 252 行日线就能把额度耗掉。
 *    代价是拆股/分红导致的历史 adjclose 修正不会被回补，需要时清表重抓。
 */
export class CandleStore {
    constructor(private db: D1Database) {}

    /** 读出 ts >= sinceTs 的点。从未抓过（无水位行）时返回 null */
    async read(symbol: string, interval: string, sinceTs: number): Promise<StoredWindow | null> {
        const [syncResult, rowsResult] = await this.db.batch<any>([
            this.db
                .prepare(
                    "select fetched_at, utc_offset, oldest_ts, newest_ts from price_candle_sync where symbol = ? and interval = ?",
                )
                .bind(symbol, interval),
            this.db
                .prepare(
                    "select ts, date, close, open, high, low from price_candles where symbol = ? and interval = ? and ts >= ? order by ts",
                )
                .bind(symbol, interval, sinceTs),
        ]);

        const sync = syncResult?.results?.[0];
        if (!sync) return null;

        const candles: PriceCandle[] = (rowsResult?.results ?? []).map((row: any) => {
            const candle: PriceCandle = {
                date: String(row.date),
                t: Number(row.ts),
                close: Number(row.close),
            };
            // 老行的 OHLC 是 NULL，这里就不带这三个字段 —— 上层据此判断要不要回填
            if (row.open != null && row.high != null && row.low != null) {
                candle.o = Number(row.open);
                candle.h = Number(row.high);
                candle.l = Number(row.low);
            }
            return candle;
        });

        return {
            candles,
            utcOffsetSeconds: Number(sync.utc_offset) || 0,
            fetchedAt: Number(sync.fetched_at) || 0,
            oldestTs: Number(sync.oldest_ts) || 0,
            newestTs: Number(sync.newest_ts) || 0,
        };
    }

    /**
     * 落库：只写水位之外的点 + 覆盖最后一根（盘中它还在动），最后更新水位。
     * rewriteAll 时整段重写 —— 只在「老行缺 OHLC 需要一次性回填」时用，
     * 常规刷新绝不能开，否则每小时重写整段会撞 rows written 额度。
     */
    async save(
        symbol: string,
        interval: string,
        series: PriceSeries,
        previous: StoredWindow | null,
        fetchedAt: number,
        rewriteAll = false,
    ): Promise<void> {
        const candles = series.candles;
        if (candles.length === 0) return;

        const pending =
            previous && !rewriteAll
                ? candles.filter((candle) => candle.t >= previous.newestTs || candle.t <= previous.oldestTs)
                : candles;

        const statements: D1PreparedStatement[] = [];
        for (let i = 0; i < pending.length; i += ROWS_PER_STATEMENT) {
            const chunk = pending.slice(i, i + ROWS_PER_STATEMENT);
            const values = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
            const bindings: (string | number | null)[] = [];
            for (const candle of chunk) {
                bindings.push(
                    symbol,
                    interval,
                    candle.t,
                    candle.date,
                    candle.close,
                    candle.o ?? null,
                    candle.h ?? null,
                    candle.l ?? null,
                );
            }
            statements.push(
                this.db
                    .prepare(
                        `insert into price_candles (symbol, interval, ts, date, close, open, high, low) values ${values}
                         on conflict(symbol, interval, ts) do update set
                             date = excluded.date,
                             close = excluded.close,
                             open = excluded.open,
                             high = excluded.high,
                             low = excluded.low`,
                    )
                    .bind(...bindings),
            );
        }

        const oldest = Math.min(candles[0].t, previous?.oldestTs ?? Number.MAX_SAFE_INTEGER);
        const newest = Math.max(candles[candles.length - 1].t, previous?.newestTs ?? 0);
        statements.push(
            this.db
                .prepare(
                    `insert into price_candle_sync (symbol, interval, fetched_at, utc_offset, oldest_ts, newest_ts)
                     values (?, ?, ?, ?, ?, ?)
                     on conflict(symbol, interval) do update set
                         fetched_at = excluded.fetched_at,
                         utc_offset = excluded.utc_offset,
                         oldest_ts = min(oldest_ts, excluded.oldest_ts),
                         newest_ts = max(newest_ts, excluded.newest_ts)`,
                )
                .bind(symbol, interval, fetchedAt, series.utcOffsetSeconds, oldest, newest),
        );

        await this.db.batch(statements);
    }
}

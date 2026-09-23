import type { SellRecord } from './types';

/**
 * 「最近一次卖出」的统一口径：先比 `sell_time`，相同再用 `id` 兜底 —— 与服务端 SQL 的
 * `ORDER BY sell_time DESC, id DESC` 完全一致。批量卖出会产生同一 `sell_time` 的多条记录，
 * 只比 `sell_time` 会让不同页面（图表排行、走势参考线）挑到不同那条，必须带上 `id` 才对得齐。
 */
export interface SellKey {
    sell_time: string;
    id: number;
}

/** a 是否比 b 更晚（更近）。b 为空时恒为 true。 */
export function isLaterSell(a: SellKey, b: SellKey | null | undefined): boolean {
    if (!b) return true;
    if (a.sell_time !== b.sell_time) return a.sell_time > b.sell_time;
    return a.id > b.id;
}

/** 从一组卖出记录里挑「最近一次」；空集或全部无 `sell_time` 时返回 null。 */
export function pickLatestSell<T extends SellKey>(records: readonly T[] | undefined): T | null {
    let latest: T | null = null;
    for (const rec of records ?? []) {
        if (!rec.sell_time) continue;
        if (isLaterSell(rec, latest)) latest = rec;
    }
    return latest;
}

// SellRecord 满足 SellKey（含 id / sell_time），此处仅做编译期自检，防止字段改名后静默漂移。
type _AssertSellRecordIsSellKey = SellRecord extends SellKey ? true : never;

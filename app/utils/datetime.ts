/**
 * 交易时间的时区口径（改前先读这段，写错会让买卖点落到错的交易日）：
 *
 * - DB 里 trades.buy_time / sell_records.sell_time 存的是 **UTC 墙上时间**，
 *   格式 `YYYY-MM-DD HH:mm:ss`，没有时区后缀 —— 保持无后缀是为了字符串排序、
 *   区间过滤、PATCH 改日期都能按字面量直接比较。
 * - 给人看的地方（首页卡片、详情页）按**设备时区**格式化，国内用户即北京时间。
 * - 走势图上要和美股交易日对齐，按行情返回的 `utcOffsetSeconds` 折算成
 *   **交易所当地日期**，不能直接 `slice(0, 10)` 取 UTC 日期。
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD HH:mm:ss`（UTC 墙上时间）→ 真实时刻；解析不了返回 null */
export function parseUtcSql(value: string | null | undefined): Date | null {
    if (!value) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim())
    if (!m) return null
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0))
}

/** 真实时刻 → `YYYY-MM-DD HH:mm:ss`（UTC 墙上时间），写回 DB 用 */
export function formatUtcSql(date: Date): string {
    return (
        `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
        `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
    )
}

/** 设备时区的 `YYYY-MM-DD HH:mm` */
export function formatLocalDateTime(value: string | null | undefined): string {
    const d = parseUtcSql(value)
    if (!d) return '--'
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 设备时区的 `MM-DD HH:mm`，列表里用 */
export function formatLocalShort(value: string | null | undefined): string {
    const d = parseUtcSql(value)
    if (!d) return '--'
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 折算成 offset 所在时区的墙上时间（用 getUTC* 取值） */
function toZoned(date: Date, offsetSeconds: number): Date {
    return new Date(date.getTime() + offsetSeconds * 1000)
}

/** UTC 时间串 → 指定时区（交易所）的 `YYYY-MM-DD` */
export function toZonedYmd(value: string | null | undefined, offsetSeconds: number): string {
    const d = parseUtcSql(value)
    if (!d) return (value || '').slice(0, 10)
    const z = toZoned(d, offsetSeconds)
    return `${z.getUTCFullYear()}-${pad(z.getUTCMonth() + 1)}-${pad(z.getUTCDate())}`
}

/**
 * 在指定时区里把日期换成 ymd、保留该时区的时分秒，再折回 UTC 串。
 * 只换日期是刻意的：排序和「最近一次卖出」都依赖完整时刻。
 */
export function replaceZonedYmd(
    value: string,
    offsetSeconds: number,
    ymd: string,
): string {
    const d = parseUtcSql(value)
    const [y, m, day] = ymd.split('-').map(Number)
    if (!d || !y || !m || !day) return value
    const z = toZoned(d, offsetSeconds)
    const ms =
        Date.UTC(y, m - 1, day, z.getUTCHours(), z.getUTCMinutes(), z.getUTCSeconds()) -
        offsetSeconds * 1000
    return formatUtcSql(new Date(ms))
}

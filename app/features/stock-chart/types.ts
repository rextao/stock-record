// 历史行情的领域模型：前端页面与 Worker 共用这一份定义

/**
 * 可选区间。值直接透传给数据源 —— Yahoo 的 range 参数就是这套写法，
 * 换数据源时在 provider 里做映射，不要改这里的取值，前端 URL 上带的就是它。
 * 注意 Yahoo 只认 `1d/5d/1mo/3mo/6mo/1y/2y/5y/10y/ytd/max`，写 `1w` 会被静默降级成 1 天。
 */
export type HistoryRange = '5d' | '1mo' | '3mo' | '6mo' | '1y' | 'ytd';

export const HISTORY_RANGES: HistoryRange[] = ['5d', '1mo', '3mo', '6mo', '1y', 'ytd'];

/**
 * 每个区间的采样粒度。
 * 5d 必须用小时线：`5d + 1d` 实测只有 5 个点，折线退化成一条直线段，看不出走势。
 * 其余区间一律日线 —— 点已经足够密，再细只会拖慢传输。
 */
export const RANGE_INTERVALS: Record<HistoryRange, string> = {
    '5d': '60m',
    '1mo': '1d',
    '3mo': '1d',
    '6mo': '1d',
    '1y': '1d',
    ytd: '1d',
};

/** 日内粒度的区间：同一天会有多个点，坐标轴要标到小时 */
export function isIntradayRange(range: HistoryRange): boolean {
    return RANGE_INTERVALS[range] !== '1d';
}

export const DEFAULT_HISTORY_RANGE: HistoryRange = '5d';

export function isHistoryRange(value: string): value is HistoryRange {
    return (HISTORY_RANGES as string[]).includes(value);
}

/**
 * 图上的一个点。close 是主力字段（折线、买卖点对齐都用它）；
 * o/h/l 只为 K 线模式服务，可能缺失（老的 D1 行、或数据源没给），画之前先用 canDrawCandles 判一次。
 * 四个价都已按 adjclose 同比例复权，互相之间可比。
 */
export interface PriceCandle {
    /**
     * 该点所属的交易日（交易所当地时区），YYYY-MM-DD。
     * 日内粒度下同一天会有多个点共享它 —— 买卖点就是按这个字段对齐的。
     */
    date: string;
    /** 该点的时间戳，epoch ms。日内粒度下靠它区分同一天内的点 */
    t: number;
    close: number;
    /** 开盘价（已复权） */
    o?: number;
    /** 最高价（已复权） */
    h?: number;
    /** 最低价（已复权） */
    l?: number;
}

/**
 * K 线最多画多少根。再多的话手机宽度下每根不到 1px，实体和影线糊成一片色块，
 * 不如直接退回折线 —— 所以长区间不禁用开关，只是渲染成折线并给一行提示。
 */
export const MAX_CANDLE_BARS = 90;

/** 这组数据能不能画成 K 线：点数合适 + 每根都带齐 OHLC */
export function canDrawCandles(candles: PriceCandle[]): boolean {
    if (candles.length < 2 || candles.length > MAX_CANDLE_BARS) return false;
    return candles.every(
        (candle) =>
            typeof candle.o === 'number' &&
            typeof candle.h === 'number' &&
            typeof candle.l === 'number' &&
            Number.isFinite(candle.o) &&
            Number.isFinite(candle.h) &&
            Number.isFinite(candle.l),
    );
}

export interface PriceHistory {
    symbol: string;
    range: HistoryRange;
    /** 按时间升序；停牌或未成交的交易日会被剔除，不补空点 */
    candles: PriceCandle[];
    /**
     * 交易所时区相对 UTC 的偏移（秒）。
     * 日内标签必须按交易所当地时间显示：美股 10:30 在北京时区是 22:30，直接用浏览器时区会读不懂。
     */
    utcOffsetSeconds: number;
    /** 我们真正打第三方拿到这份数据的时刻（epoch ms），语义与 LiveQuote.fetchedAt 一致 */
    fetchedAt: number;
}

/** 落在折线上的买卖点 */
export interface TradeMark {
    /** 成交日，YYYY-MM-DD */
    date: string;
    /**
     * 这个标记对应的数据库记录 id：买点是 trades.id，卖点是 sell_records.id。
     * 走势页要就地改成交日期，得能定位回源记录。
     */
    sourceId: number;
    /** 成交时刻原文（YYYY-MM-DD HH:mm:ss）。改日期时保留后面的时分秒 */
    time: string;
    price: number;
    quantity: number;
    side: 'buy' | 'sell';
    /** 这笔卖出实现的盈亏；买入点没有这个值 */
    profit?: number;
}

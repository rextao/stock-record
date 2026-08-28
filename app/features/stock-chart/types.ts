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

export const DEFAULT_HISTORY_RANGE: HistoryRange = '3mo';

export function isHistoryRange(value: string): value is HistoryRange {
    return (HISTORY_RANGES as string[]).includes(value);
}

/** 折线上的一个点。只留收盘价：折线图用不到 OHLC，少传一半字节 */
export interface PriceCandle {
    /**
     * 该点所属的交易日（交易所当地时区），YYYY-MM-DD。
     * 日内粒度下同一天会有多个点共享它 —— 买卖点就是按这个字段对齐的。
     */
    date: string;
    /** 该点的时间戳，epoch ms。日内粒度下靠它区分同一天内的点 */
    t: number;
    close: number;
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
    price: number;
    quantity: number;
    side: 'buy' | 'sell';
    /** 这笔卖出实现的盈亏；买入点没有这个值 */
    profit?: number;
}

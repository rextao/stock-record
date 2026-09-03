import type { HistoryRange, PriceCandle, PriceHistory } from "../../../../../app/features/stock-chart/types";

/** provider 返回的原始序列 + 交易所时区，时区要透到前端才能把日内点标成当地时间 */
export interface PriceSeries {
    candles: PriceCandle[];
    utcOffsetSeconds: number;
}

/**
 * 历史行情数据源。刻意与 IStockProvider 分开：
 * Finnhub 免费档没有 candle 权限（实测 403），报价和历史必然来自两家，
 * 硬塞进同一个接口会逼着每个 provider 实现一堆自己不支持的方法。
 */
export interface IStockHistoryProvider {
    /** 返回按时间升序的收盘价序列，粒度由区间决定；查不到数据抛错，由上层统一降级 */
    getCloses(symbol: string, range: HistoryRange): Promise<PriceSeries>;
}

/** 对外暴露的历史行情服务：在 provider 外面套了缓存与元信息 */
export interface IStockHistoryService {
    /**
     * force 是手动刷新：清掉两级缓存并跳过 D1 的新鲜短路，直接打上游。
     * 上游失败时仍然用 D1 里的旧曲线兜底 —— 刷新失败不该把已经画出来的图变成错误页。
     */
    getHistory(symbol: string, range: HistoryRange, options?: { force?: boolean }): Promise<PriceHistory>;
}

// 标准化的股票搜索结果
export interface StockSearchResult {
    symbol: string;
    description: string;
    exchange: string;
    type?: string;
}

// 统一的股票数据源提供者接口
export interface IStockProvider {
    /**
     * 根据关键字搜索股票
     * @param query 搜索关键字 (如 AAPL)
     */
    search(query: string): Promise<StockSearchResult[]>;

    getLivePrice(symbol: string): Promise<number | null>;
}

/** 带元信息的报价。前端靠它区分「新鲜 / 旧 / 取不到」三种状态 */
export interface LiveQuote {
    /** 价格；取不到时为 null */
    price: number | null;
    /**
     * 我们真正打第三方拿到这个价格的时刻（epoch ms），随缓存一起存。
     * 刻意不用行情自带的时间戳：休市期间价格本来不动，那样会把所有标的都标成「旧」。
     */
    fetchedAt: number | null;
    /** 取数异常的原因；正常为 null。null 价格 + NO_QUOTE 表示这个代码查不到报价 */
    error: string | null;
}

/**
 * 对外暴露的行情服务：provider 只管取数（返回纯数字），
 * 元信息与强制刷新由缓存层负责，所以这层比 IStockProvider 宽。
 */
export interface IStockService extends IStockProvider {
    getQuote(symbol: string, options?: { force?: boolean }): Promise<LiveQuote>;
}

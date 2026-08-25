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

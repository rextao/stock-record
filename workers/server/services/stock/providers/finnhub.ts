import type {IStockProvider, StockSearchResult} from "../types";

// 只负责取数与字段归一，缓存由外层 withStockCache 统一处理
export class FinnhubProvider implements IStockProvider {
    private apiKey: string;
    private baseUrl = 'https://finnhub.io/api/v1';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async search(query: string): Promise<StockSearchResult[]> {
        // 软校验：调用时才拦截
        if (!this.apiKey) {
            throw new Error("MISSING_API_KEY");
        }

        try {
            const response = await fetch(`${this.baseUrl}/search?q=${encodeURIComponent(query)}&exchange=US&token=${this.apiKey}`);

            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }

            const data = await response.json() as any;

            // 转换为统一的标准数据结构
            const results: StockSearchResult[] = (data.result || [])
                .map((item: any) => ({
                    symbol: item.symbol || item.displaySymbol || '',
                    description: item.description || '',
                    exchange: item.exchange || 'US',
                    type: item.type || '',
                }))
                .filter((item: StockSearchResult) => item.symbol !== '');

            return results.slice(0, 8);
        } catch (error: any) {
            // 如果是我们自定义的缺少 key 错误，直接向上抛出给业务层处理
            if (error.message === "MISSING_API_KEY") {
                throw error;
            }
            console.error("[FinnhubProvider] Search failed:", error);
            return [];
        }
    }


    async getLivePrice(symbol: string): Promise<number | null> {
        // 没配凭证要抛错而不是 return null：返回 null 会被上层归成 NO_QUOTE
        // （「行情源查不到这个代码」），把配置问题报成数据问题，前端提示就是错的
        if (!this.apiKey) throw new Error("MISSING_API_KEY");

        try {
            const response = await fetch(`${this.baseUrl}/quote?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`);
            if (!response.ok) return null;

            const data = await response.json() as any;

            // Finnhub 的 /quote 接口中，'c' 代表 current price；0 表示查不到这个代码
            if (data && typeof data.c === 'number' && data.c > 0) {
                return data.c;
            }
            return null;
        } catch (error) {
            console.error(`[FinnhubProvider] Failed to get live price for ${symbol}:`, error);
            return null;
        }
    }
}

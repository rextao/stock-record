import type {IStockProvider, StockSearchResult} from "../types";
const quoteCache = new Map<string, { price: number; expiresAt: number }>();

export class FinnhubProvider implements IStockProvider {
    private apiKey: string;
    private baseUrl = 'https://finnhub.io/api/v1';
    private cacheTtl: number;

    constructor(apiKey: string, cacheTtlSeconds: number) {
        this.apiKey = apiKey;
        this.cacheTtl = cacheTtlSeconds;
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


    // 👈 新增：获取实时报价并做缓存拦截
    async getLivePrice(symbol: string): Promise<number | null> {
        if (!this.apiKey) return null;

        const now = Date.now();
        const cached = quoteCache.get(symbol);

        // 命中缓存且未过期，直接返回内存数据，不发网络请求
        if (cached && cached.expiresAt > now) {
            return cached.price;
        }

        try {
            const response = await fetch(`${this.baseUrl}/quote?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`);
            if (!response.ok) return null;

            const data = await response.json() as any;

            // Finnhub 的 /quote 接口中，'c' 代表 current price
            if (data && typeof data.c === 'number') {
                const currentPrice = data.c;

                // 写入缓存字典
                quoteCache.set(symbol, {
                    price: currentPrice,
                    expiresAt: now + (this.cacheTtl * 1000)
                });

                return currentPrice;
            }
            return null;
        } catch (error) {
            console.error(`[FinnhubProvider] Failed to get live price for ${symbol}:`, error);
            return null;
        }
    }
}

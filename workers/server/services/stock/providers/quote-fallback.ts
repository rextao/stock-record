import type { IStockProvider, StockSearchResult } from "../types";

/**
 * 搜索始终交给主数据源；只有报价取不到时才调用备用源。
 * Twelve Data 免费档每分钟只有 8 次请求，不能用它并行补做搜索或双源校验。
 */
export class QuoteFallbackProvider implements IStockProvider {
	constructor(
		private readonly primary: IStockProvider,
		private readonly fallback: IStockProvider,
	) {}

	search(query: string): Promise<StockSearchResult[]> {
		return this.primary.search(query);
	}

	async getLivePrice(symbol: string): Promise<number | null> {
		try {
			const price = await this.primary.getLivePrice(symbol);
			if (typeof price === "number" && Number.isFinite(price) && price > 0) return price;
		} catch (error) {
			console.warn(`[stock] primary quote failed for ${symbol}, trying fallback`, error);
		}

		return this.fallback.getLivePrice(symbol);
	}
}

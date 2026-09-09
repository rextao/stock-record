import type { IStockProvider, StockSearchResult } from "../types";

interface TwelveDataPriceResponse {
	price?: string | number;
	code?: number;
	message?: string;
	status?: string;
}

export class TwelveDataProvider implements IStockProvider {
	private readonly baseUrl = "https://api.twelvedata.com";

	constructor(private readonly apiKey: string) {}

	// 当前只把 Twelve Data 用作报价兜底；股票搜索继续走 Finnhub，避免浪费 8 次/分钟额度。
	async search(_query: string): Promise<StockSearchResult[]> {
		return [];
	}

	async getLivePrice(symbol: string): Promise<number | null> {
		if (!this.apiKey) throw new Error("MISSING_TWELVE_DATA_API_KEY");

		const url = new URL(`${this.baseUrl}/price`);
		url.searchParams.set("symbol", symbol);
		url.searchParams.set("apikey", this.apiKey);

		let response: Response;
		try {
			response = await fetch(url);
		} catch (error) {
			console.error(`[TwelveDataProvider] Request failed for ${symbol}:`, error);
			throw new Error("TWELVE_DATA_UNAVAILABLE");
		}

		let data: TwelveDataPriceResponse;
		try {
			data = await response.json<TwelveDataPriceResponse>();
		} catch {
			throw new Error("TWELVE_DATA_INVALID_RESPONSE");
		}

		if (!response.ok || data.status === "error") {
			if (response.status === 429 || data.code === 429) {
				throw new Error("TWELVE_DATA_RATE_LIMITED");
			}
			console.warn(`[TwelveDataProvider] Quote failed for ${symbol}:`, data.message || response.status);
			throw new Error("TWELVE_DATA_ERROR");
		}

		const price = Number(data.price);
		return Number.isFinite(price) && price > 0 ? price : null;
	}
}

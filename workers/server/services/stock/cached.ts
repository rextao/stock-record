import type { IStockProvider, IStockService, LiveQuote, StockSearchResult } from "./types";
import { createCache } from "../../cache";

export interface StockCacheOptions {
	/** 数据源标识，用来隔离缓存：换 provider 不会读到上一家的数据 */
	providerName: string;
	searchTtlSeconds: number;
	quoteTtlSeconds: number;
}

/**
 * 给任意 IStockProvider 套一层缓存。缓存逻辑与具体数据源无关，
 * 新增 provider 时只实现纯粹的取数，不用各自再写一遍 TTL。
 */
export function withStockCache(provider: IStockProvider, options: StockCacheOptions): IStockService {
	const cache = createCache(`stock:${options.providerName}`);

	// 缓存里存的是 LiveQuote 对象而不是裸数字，v2 用来跳过旧版本残留的纯数字值
	// （L2 边缘缓存最长还会留 quoteTtl 秒，读到旧形状会让 quote.price 变成 undefined）
	const quoteKey = (symbol: string) => ["quote", "v2", symbol];

	return {
		search(query: string): Promise<StockSearchResult[]> {
			const normalized = query.trim().toLowerCase();
			return cache.wrap<StockSearchResult[]>(
				["search", normalized],
				{
					ttlSeconds: options.searchTtlSeconds,
					// 空结果不缓存：可能是限流或网络抖动，缓存住会让用户在整个 TTL 内都搜不到
					shouldCache: (results) => Array.isArray(results) && results.length > 0,
				},
				() => provider.search(normalized),
			);
		},

		getLivePrice(symbol: string): Promise<number | null> {
			return getQuote(symbol).then((quote) => quote.price);
		},

		getQuote,
	};

	async function getQuote(symbol: string, quoteOptions: { force?: boolean } = {}): Promise<LiveQuote> {
		const normalized = symbol.trim().toUpperCase();
		if (!normalized) return { price: null, fetchedAt: null, error: "EMPTY_SYMBOL" };

		const key = quoteKey(normalized);
		// 手动刷新：先把两级缓存清掉，再走正常的 wrap 回填，这样刷新结果同样被后续请求复用
		if (quoteOptions.force) await cache.invalidate(key);

		try {
			return await cache.wrap<LiveQuote>(
				key,
				{
					ttlSeconds: options.quoteTtlSeconds,
					// 只缓存拿到了有效价格的结果：失败不该被锁定一个 TTL 周期
					shouldCache: (quote) => typeof quote.price === "number" && Number.isFinite(quote.price),
				},
				async () => {
					const price = await provider.getLivePrice(normalized);
					const valid = typeof price === "number" && Number.isFinite(price);
					return {
						price: valid ? price : null,
						fetchedAt: Date.now(),
						error: valid ? null : "NO_QUOTE",
					};
				},
			);
		} catch (error: any) {
			// provider 抛错（缺凭证、网络异常）时不让整个持仓列表挂掉，降级成带错误标记的空报价
			console.warn(`[stock] quote failed for ${normalized}`, error);
			return { price: null, fetchedAt: Date.now(), error: error?.message || "QUOTE_FAILED" };
		}
	}
}

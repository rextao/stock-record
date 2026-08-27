import type { IStockProvider, StockSearchResult } from "./types";
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
export function withStockCache(provider: IStockProvider, options: StockCacheOptions): IStockProvider {
	const cache = createCache(`stock:${options.providerName}`);

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
			const normalized = symbol.trim().toUpperCase();
			if (!normalized) return Promise.resolve(null);
			return cache.wrap<number | null>(
				["quote", normalized],
				{
					ttlSeconds: options.quoteTtlSeconds,
					shouldCache: (price) => typeof price === "number" && Number.isFinite(price),
				},
				() => provider.getLivePrice(normalized),
			);
		},
	};
}

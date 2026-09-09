import type { IStockProvider } from "../types";
import type { AppConfig } from "../../../config";
import { FinnhubProvider } from "./finnhub";
import { QuoteFallbackProvider } from "./quote-fallback";
import { TwelveDataProvider } from "./twelve-data";

export type StockProviderFactory = (config: AppConfig) => IStockProvider;

/**
 * 数据源注册表。新增第三方只需要：实现 IStockProvider，然后在这里挂一行。
 * 缓存、切换逻辑都在外层，provider 自己只管取数与字段归一。
 */
export const stockProviders: Record<string, StockProviderFactory> = {
	finnhub: (config) => {
		const primary = new FinnhubProvider(config.providers.finnhub.apiKey);
		const fallbackKey = config.providers.twelveData.apiKey;
		return fallbackKey
			? new QuoteFallbackProvider(primary, new TwelveDataProvider(fallbackKey))
			: primary;
	},
	twelvedata: (config) => new TwelveDataProvider(config.providers.twelveData.apiKey),
};

export const DEFAULT_STOCK_PROVIDER = "finnhub";

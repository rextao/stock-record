import type { IStockProvider } from "../types";
import type { AppConfig } from "../../../config";
import { FinnhubProvider } from "./finnhub";

export type StockProviderFactory = (config: AppConfig) => IStockProvider;

/**
 * 数据源注册表。新增第三方只需要：实现 IStockProvider，然后在这里挂一行。
 * 缓存、切换逻辑都在外层，provider 自己只管取数与字段归一。
 */
export const stockProviders: Record<string, StockProviderFactory> = {
	finnhub: (config) => new FinnhubProvider(config.providers.finnhub.apiKey),
};

export const DEFAULT_STOCK_PROVIDER = "finnhub";

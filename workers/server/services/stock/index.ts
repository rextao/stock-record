import type { IStockService } from "./types";
import { DEFAULT_STOCK_PROVIDER, stockProviders } from "./providers";
import { withStockCache } from "./cached";
import { getConfig } from "../../config";

/**
 * 行情服务工厂：按配置选数据源，再统一套上缓存。
 * 切换数据源只改 STOCK_PROVIDER 环境变量，缓存行为不变。
 */
export function getStockProvider(env: any): IStockService {
    const config = getConfig(env);

    let name = config.stockProvider;
    let factory = stockProviders[name];
    if (!factory) {
        console.warn(`[stock] 未知数据源 "${name}"，回退到 ${DEFAULT_STOCK_PROVIDER}`);
        name = DEFAULT_STOCK_PROVIDER;
        factory = stockProviders[DEFAULT_STOCK_PROVIDER];
    }

    return withStockCache(factory(config), {
        providerName: name,
        quoteTtlSeconds: config.cache.quoteTtlSeconds,
        searchTtlSeconds: config.cache.searchTtlSeconds,
    });
}

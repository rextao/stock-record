import type {IStockProvider} from "./types";
import { FinnhubProvider } from "./providers/finnhub";
import { getConfig } from "../../config";

/**
 * 股票服务工厂方法
 */
export function getStockProvider(env: any): IStockProvider {
    // 获取配置
    const config = getConfig(env);

    // 实例化具体的提供者
    return new FinnhubProvider(
        config.providers.finnhubApiKey,
        config.cache.quoteTtlSeconds
    );
}

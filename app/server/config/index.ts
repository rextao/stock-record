export interface AppConfig {
    providers: {
        finnhubApiKey: string;
    };
    cache: {
        quoteTtlSeconds: number; // 股票报价的缓存有效时长
    }
}

export function getConfig(env: any): AppConfig {
    return {
        providers: {
            finnhubApiKey: env.FINNHUB_API_KEY || '',
        },
        cache: {
            // 默认缓存 600 秒 (10 分钟)
            quoteTtlSeconds: Number(env.QUOTE_CACHE_TTL) || 600,
        }
    };
}

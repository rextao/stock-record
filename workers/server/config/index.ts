export interface AppConfig {
    /** 当前启用的行情数据源，对应 providers 注册表的 key */
    stockProvider: string;
    providers: {
        finnhub: { apiKey: string };
    };
    cache: {
        quoteTtlSeconds: number; // 实时报价缓存时长
        searchTtlSeconds: number; // 股票搜索结果缓存时长（代码与名称几乎不变，可以放很久）
    };
}

export function getConfig(env: any): AppConfig {
    return {
        stockProvider: (env.STOCK_PROVIDER || '').trim() || 'finnhub',
        providers: {
            finnhub: { apiKey: env.FINNHUB_API_KEY || '' },
        },
        cache: {
            // 默认缓存 600 秒 (10 分钟)
            quoteTtlSeconds: Number(env.QUOTE_CACHE_TTL) || 600,
            // 默认缓存 1 天
            searchTtlSeconds: Number(env.SEARCH_CACHE_TTL) || 86400,
        },
    };
}

本地配置文件
[.dev.vars](.dev.vars)
FINNHUB_API_KEY=你的_FINNHUB_KEY
TWELVE_DATA_API_KEY=你的_TWELVE_DATA_KEY
QUOTE_CACHE_TTL=600




Cloudflare需要配置环境变量
1. Workers & Pages -> 你的项目 -> Settings -> Variables and Secrets 里面，将 `FINNHUB_API_KEY` 和 `TWELVE_DATA_API_KEY` 配置为 Secret。Finnhub 报价失败时才会使用 Twelve Data。

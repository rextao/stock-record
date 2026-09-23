import { ApiError } from '../../api/trading';

/**
 * 报价链路的共享口径：错误文案、判「旧」阈值、失败冷却时长。
 * 首页持仓卡片（HoldingCard）与新增记录页的「获取现价」按钮共用同一份，避免各写一套、
 * 报错措辞和冷却时长各自漂移。
 */

// 超过这个时长就把现价视为「旧」：卡片标黄、按钮再点会重新拉。
// 依据是我们抓取的时刻，不是行情自带时间戳 —— 休市时价格本来不动，用后者会长期误报旧。
export const QUOTE_STALE_AFTER_MS = 5 * 60 * 1000;

// 刷新失败后的冷却：Finnhub 免费档只有 60 次/分钟，失败时用户往往连点，越点越取不到价。
export const QUOTE_REFRESH_COOLDOWN_MS = 3000;

const REASON_TEXT: Record<string, string> = {
    MISSING_API_KEY: '行情凭证未配置，暂时取不到价格',
    NO_QUOTE: '行情源查不到该代码，检查一下代码是否正确',
    EMPTY_SYMBOL: '该条目没有登记股票代码',
};

/** 报价 reason → 中文提示；没有对应文案时返回 undefined，交调用方兜底 */
export const quoteReasonText = (reason: string | null | undefined): string | undefined =>
    reason ? REASON_TEXT[reason] : undefined;

/**
 * 把报价接口的错误翻成「说清该怎么办」的中文。
 *
 * 判据是 `ApiError.status` + 服务端给的机器可读 `reason`，不是裸 `message` ——
 * 服务端的 message 对所有取不到价的情况都是同一句「行情接口异常」，分不出是代码写错了、
 * 凭证没配还是上游挂了。fetch 自己抛错（离线、DNS）时没有 status。
 */
export const describeQuoteError = (error: unknown): string => {
    if (error instanceof ApiError) {
        const known = quoteReasonText(error.reason);
        if (known) return known;
        if (error.status === 429) return '行情源限流，过一会儿再试';
        if (error.status >= 500) return '行情接口异常，请稍后重试';
        return error.message || '刷新失败';
    }
    return '网络不可用，请检查连接后重试';
};

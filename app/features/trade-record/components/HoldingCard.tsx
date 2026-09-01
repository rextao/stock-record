import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, ChartLine, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { Toast } from 'antd-mobile';
import { ApiError, fetchQuote } from '../../../api/trading';
import { useSharedNow } from '../../../common/hooks/useSharedNow';
import { formatLocalShort } from '../../../utils/datetime';
import styles from './HoldingCard.module.less';

const formatPrice = (val: number) => val.toFixed(2);
// 仅显示 MM-DD HH:mm，适合列表展示。DB 存的是 UTC 墙上时间，
// 不能直接截字符串，要按设备时区折算（详见 app/utils/datetime.ts）
const formatShortTime = (timeStr: string) => formatLocalShort(timeStr);

// 涨跌统一走同一个判断，避免各处重复写三元
const pnlClass = (value: number) => (value >= 0 ? styles.up : styles.down);

// 超过这个时长就把现价标黄，提示「该刷一下了」。
// 判断依据是服务端的抓取时刻，不是行情自带的时间戳 —— 休市时价格本来不动，
// 用行情时间戳会让所有标的一直是黄色，等于没有提示。
const STALE_AFTER_MS = 5 * 60 * 1000;

// 刷新失败后的冷却时间。Finnhub 免费档只有 60 次/分钟，失败时用户往往会连点，
// 越点越容易把额度打满，反而更取不到价
const REFRESH_COOLDOWN_MS = 3000;

const REASON_TEXT: Record<string, string> = {
    MISSING_API_KEY: '行情凭证未配置，暂时取不到价格',
    NO_QUOTE: '行情源查不到该代码，检查一下代码是否正确',
    EMPTY_SYMBOL: '该条目没有登记股票代码',
};

/**
 * 把报价接口的错误翻成「说清该怎么办」的中文。
 *
 * 判据是 `ApiError.status` + 服务端给的机器可读 `reason`，不是裸 `message` ——
 * 服务端的 message 对所有取不到价的情况都是同一句「行情接口异常」，分不出是
 * 代码写错了、凭证没配还是上游挂了。fetch 自己抛错（离线、DNS）时没有 status。
 */
const describeQuoteError = (error: unknown): string => {
    if (error instanceof ApiError) {
        const known = error.reason ? REASON_TEXT[error.reason] : undefined;
        if (known) return known;
        if (error.status === 429) return '行情源限流，过一会儿再试';
        if (error.status >= 500) return '行情接口异常，请稍后重试';
        return error.message || '刷新失败';
    }
    return '网络不可用，请检查连接后重试';
};

interface QuoteState {
    price: number | null;
    fetchedAt: number | null;
    error: string | null;
}

const quoteFromHolding = (holding: any): QuoteState => ({
    price: typeof holding.live_price === 'number' ? holding.live_price : null,
    fetchedAt: typeof holding.live_price_at === 'number' ? holding.live_price_at : null,
    error: holding.live_price_error ?? null,
});

// 只做到分钟粒度，卡片上的空间放不下更精确的描述
const formatAge = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${Math.max(minutes, 1)} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    return `${Math.floor(hours / 24)} 天前`;
};

export function HoldingCard({ holding }: { holding: any }) {
    const [expanded, setExpanded] = useState(true);
    const [quote, setQuote] = useState<QuoteState>(() => quoteFromHolding(holding));
    const [refreshing, setRefreshing] = useState(false);
    // 刷新失败：价格照旧显示（旧价比 `--` 有用），只把它标成异常色
    const [refreshFailed, setRefreshFailed] = useState(false);
    const [cooling, setCooling] = useState(false);
    const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const now = useSharedNow();
    const navigate = useNavigate();

    // loader 重新校验后，服务端数据视为权威，覆盖掉本地手动刷新的结果
    useEffect(() => {
        setQuote(quoteFromHolding(holding));
        setRefreshFailed(false);
    }, [holding.live_price, holding.live_price_at, holding.live_price_error]);

    useEffect(() => () => {
        if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    }, []);

    const hasPrice = quote.price != null;
    // 自定义条目可以没有代码：没代码就没有行情，别把它当成「报价异常」
    const hasSymbol = !!String(holding.item_symbol || '').trim();
    const age = quote.fetchedAt != null ? now - quote.fetchedAt : null;
    const stale = hasPrice && age != null && age > STALE_AFTER_MS;

    const handleRefresh = async (event: MouseEvent<HTMLButtonElement>) => {
        // 卡片外层套着「点击进详情」和 SwipeAction，不拦住就会误跳页
        event.stopPropagation();
        event.preventDefault();
        if (refreshing || cooling) return;

        setRefreshing(true);
        try {
            const next = await fetchQuote(holding.item_symbol, { refresh: true });
            setQuote({ price: next.price, fetchedAt: next.fetchedAt ?? Date.now(), error: null });
            setRefreshFailed(false);
        } catch (error: any) {
            // 保留旧价和旧的抓取时刻：失败不该让能看的价格消失，也不该伪造新鲜度
            setQuote((prev) => ({ ...prev, error: error?.reason || error?.message || '刷新失败' }));
            setRefreshFailed(true);
            Toast.show({ icon: 'fail', content: describeQuoteError(error) });
            setCooling(true);
            cooldownTimer.current = setTimeout(() => setCooling(false), REFRESH_COOLDOWN_MS);
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <div className={styles.card}>
            <div className={styles.header}>
                {/* 第一行只放标的名和现价：挤进笔数、时效等信息会让标的名被压没 */}
                <div className={styles.headerMain}>
                    <span className={styles.itemName}>{holding.item_name}</span>
                    <div className={styles.livePrice}>
                        {hasPrice ? (
                            <span
                                className={clsx(
                                    styles.livePriceValue,
                                    stale && styles.livePriceStale,
                                    refreshFailed && styles.livePriceError,
                                )}
                                title={age != null ? `更新于 ${formatAge(age)}` : undefined}
                            >
                                {formatPrice(quote.price as number)}
                            </span>
                        ) : (
                            <span
                                className={clsx(styles.livePriceValue, styles.livePriceMissing)}
                                title={
                                    !hasSymbol
                                        ? '该条目没有登记股票代码，不拉行情'
                                        : (quote.error ? REASON_TEXT[quote.error] : undefined) ||
                                          quote.error ||
                                          '报价异常'
                                }
                            >
                                --
                            </span>
                        )}
                        {!hasPrice && !refreshing && hasSymbol && (
                            <AlertTriangle size={13} className={styles.livePriceAlert} aria-hidden />
                        )}
                        {hasSymbol && (
                            <button
                                type="button"
                                className={clsx(
                                    styles.refreshButton,
                                    refreshing && styles.refreshing,
                                    cooling && styles.cooling,
                                )}
                                aria-label="刷新现价"
                                aria-busy={refreshing}
                                // pointerdown 也要拦：SwipeAction 是在指针事件上做手势识别的
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={handleRefresh}
                            >
                                <RefreshCw size={14} />
                            </button>
                        )}
                    </div>
                </div>
                {/* 第二行放次要信息，现价过期的提示也挪到这里 */}
                <div className={styles.headerSub}>
                    <span className={styles.itemMeta}>
                        {holding.trade_count} 笔持仓 · 余 {holding.remaining_qty} 仓
                    </span>
                    {stale && <span className={styles.livePriceAge}>现价 {formatAge(age as number)}</span>}
                </div>
            </div>

            <div className={styles.summary}>
                <div className={styles.summaryCell}>
                    <span className={styles.summaryLabel}>最近平仓价</span>
                    {holding.last_sell_price != null ? (
                        <span className={clsx(styles.summaryValue, styles.weightNormal)}>
                            {formatPrice(holding.last_sell_price)}
                        </span>
                    ) : (
                        <span className={clsx(styles.summaryValue, styles.summaryEmpty)}>--</span>
                    )}
                </div>
                <div className={clsx(styles.summaryCell, styles.alignCenter)}>
                    <span className={styles.summaryLabel}>加权均价</span>
                    <span className={clsx(styles.summaryValue, styles.weightNormal)}>
                        {formatPrice(holding.weighted_avg_price)}
                    </span>
                </div>
                <div className={clsx(styles.summaryCell, styles.alignEnd)}>
                    <span className={styles.summaryLabel}>累计平仓盈亏</span>
                    <span className={clsx(styles.summaryValue, pnlClass(holding.realized_pnl))}>
                        {holding.realized_pnl >= 0 ? '+' : ''}
                        {holding.realized_pnl.toFixed(2)}
                    </span>
                </div>
            </div>

            {/* 底部栏：左边走势入口，右边展开/收起箭头，正好用掉这行本来空着的地方 */}
            <div className={styles.toggleRow}>
                {/* 没登记代码的条目拉不到历史行情，入口直接不给，点进去只会是错误页 */}
                {hasSymbol ? (
                    <button
                        type="button"
                        className={styles.historyButton}
                        // 与刷新按钮同理：外层的「点击进详情」和 SwipeAction 手势都要拦住
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            // 名称和代码随导航带过去，走势页首屏就能出 NavBar 标题和曲线，
                            // 不用等持仓详情回来（那会让点击看起来像卡住）
                            navigate(`/holdings/${holding.item_id}/history`, {
                                state: { name: holding.item_name, symbol: holding.item_symbol },
                            });
                        }}
                    >
                        <ChartLine size={14} />
                        走势
                    </button>
                ) : (
                    <span />
                )}
                {holding.sub_trades.length > 0 && (
                    <div
                        className={styles.toggleButton}
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(!expanded);
                        }}
                    >
                        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                )}
            </div>

            {expanded && holding.sub_trades.length > 0 && (
                <div className={styles.subTradeList}>
                    {holding.sub_trades.map((st: any) => {
                        const upside =
                            st.current_price > 0 ? ((st.target_price - st.current_price) / st.current_price) * 100 : 0;
                        const downside =
                            st.current_price > 0 ? ((st.current_price - st.stop_loss_price) / st.current_price) * 100 : 0;

                        const hasLive = holding.live_price != null;
                        const livePnlAmount = hasLive ? (holding.live_price - st.current_price) * st.remaining : 0;
                        // 单仓/单股价差
                        const livePnlPerShare = hasLive ? holding.live_price - st.current_price : 0;

                        return (
                            <div key={st.id} className={styles.subTrade}>
                                <div className={styles.subTradeLeft}>
                                    <span className={styles.buyTime}>{formatShortTime(st.buy_time)}</span>
                                    <span className={styles.buyPrice}>
                                        <span className={styles.inlineLabel}>入: </span>
                                        {formatPrice(st.current_price)}
                                    </span>
                                    <span className={styles.buyQty}>
                                        <span className={styles.inlineLabel}>仓: </span>
                                        {Math.floor(st.remaining)}
                                    </span>
                                </div>

                                <div className={styles.subTradeRight}>
                                    {/* 1. 预期列 */}
                                    <div className={styles.metricCol}>
                                        <span className={styles.metricLabel}>预期</span>
                                        <span className={styles.metricValue}>{formatPrice(st.target_price)}</span>
                                        <span className={clsx(styles.metricPct, pnlClass(upside))}>
                                            {upside >= 0 ? '+' : ''}
                                            {upside.toFixed(1)}%
                                        </span>
                                    </div>

                                    {/* 2. 止损列（放在当前盈亏之前，读起来更连贯） */}
                                    <div className={styles.metricCol}>
                                        <span className={styles.metricLabel}>止损</span>
                                        <span className={styles.metricValue}>{formatPrice(st.stop_loss_price)}</span>
                                        <span className={clsx(styles.metricPct, styles.down)}>
                                            {-downside.toFixed(1)}%
                                        </span>
                                    </div>

                                    {/* 3. 当前浮动收益列（靠数字字号和语义色区分，不再加底色） */}
                                    <div className={styles.pnlCol}>
                                        <span className={styles.metricLabel}>当前盈亏</span>
                                        {hasLive ? (
                                            <>
                                                <span className={clsx(styles.pnlAmount, pnlClass(livePnlAmount))}>
                                                    {livePnlAmount >= 0 ? '+' : ''}
                                                    {livePnlAmount.toFixed(0)}
                                                </span>
                                                <span className={styles.pnlPerShare}>
                                                    单仓 {livePnlPerShare >= 0 ? '+' : ''}
                                                    {livePnlPerShare.toFixed(2)}
                                                </span>
                                            </>
                                        ) : (
                                            <span className={styles.pnlEmpty}>--</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

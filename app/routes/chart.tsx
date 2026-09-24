import { useEffect, useMemo, useState } from 'react'
import { Popup, Calendar, SpinLoading, Toast } from 'antd-mobile'
import { ChartNoAxesColumn } from 'lucide-react'
import clsx from 'clsx'
import PnlTrendChart from '../features/stock-chart/components/PnlTrendChart'
import { EmptyState } from '../common/components/EmptyState'
import { fetchTrades, fetchHoldings, fetchQuote } from '../api/trading'
import {
    readTradesCache,
    writeTradesCache,
    readHoldingsCache,
    writeHoldingsCache,
    readQuoteCache,
    writeQuoteCache,
} from '../features/trade-record/sessionCache'
import { isLaterSell } from '../features/trade-record/lastSell'
import { QUOTE_STALE_AFTER_MS } from '../features/trade-record/quote'
import styles from './chart.module.less'

// 直接使用纯前端复用的计算库
import {
    CHART_ALL_START,
    CHART_RANGE_OPTIONS,
    type ChartRangeKey,
    formatRangeChip,
    getChartRangeBounds,
    isTimeInRange,
    todayDate,
    enumerateDays,
} from '../utils/dateRange'

type TabKey = 'pnl' | 'asset';

const pnlClass = (value: number) => (value >= 0 ? styles.up : styles.down);

// 带正负号的金额，统一口径
const signed = (value: number) => (value >= 0 ? '+' : '') + value.toFixed(2);

// 报价缓存 / 浮盈计算统一用「去空格 + 大写」后的代码做键
const symbolKey = (raw: unknown) => String(raw || '').trim().toUpperCase();

// 日期格式化：将 Date 对象转为 YYYY-MM-DD
const formatDateStr = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

// 从会话缓存预填当前持仓现价：切 Tab / 冷启动时「持仓浮盈」能先秒出上次那份
const seedQuotePrices = (holdings: any[]): Record<string, number> => {
    const init: Record<string, number> = {};
    for (const h of holdings) {
        const sym = symbolKey(h.item_symbol);
        if (!sym) continue;
        const cached = readQuoteCache(sym);
        if (cached?.price != null) init[sym] = cached.price;
    }
    return init;
};

// ==========================================
// 客户端组件
// ==========================================
export default function ChartRoute() {
    const [activeTab, setActiveTab] = useState<TabKey>('pnl');

    // 首屏先用上次缓存的交易列表垫（切 Tab 秒开），下面的 effect 再后台重拉纠正。
    const [trades, setTrades] = useState<any[]>(() => readTradesCache() ?? []);
    const [loading, setLoading] = useState(() => readTradesCache() === null);

    // 持仓结构 + 现价：只用来算「持仓浮盈」里的未实现部分，是附加信息，拉失败不打扰用户。
    const [holdings, setHoldings] = useState<any[]>(() => readHoldingsCache() ?? []);
    const [quotePrices, setQuotePrices] = useState<Record<string, number>>(() =>
        seedQuotePrices(readHoldingsCache() ?? [])
    );

    // 日期区间只作用于「资产分析」的收益折线图；「盈亏分析」恒取全部时间。
    const [rangeKey, setRangeKey] = useState<ChartRangeKey>('all');
    const [customStart, setCustomStart] = useState(CHART_ALL_START);
    const [customEnd, setCustomEnd] = useState(todayDate());
    const [calendarVisible, setCalendarVisible] = useState(false);
    const [customApplied, setCustomApplied] = useState(false);

    // 交易列表：已实现盈亏、排行、收益趋势都来自它。
    // 有缓存时首屏已拿缓存渲染，这次拉取只是后台重新校验，失败别打扰用户（旧数据还在）。
    useEffect(() => {
        const controller = new AbortController();
        const hadCache = readTradesCache() != null;
        fetchTrades({ signal: controller.signal })
            .then((res) => {
                const list = res.trades || [];
                setTrades(list);
                writeTradesCache(list);
            })
            .catch((error: any) => {
                if (controller.signal.aborted) return;
                if (!hadCache) Toast.show(error?.message || '加载失败');
            })
            .finally(() => {
                if (controller.signal.aborted) return;
                setLoading(false);
            });
        return () => controller.abort();
    }, []);

    // 持仓结构：算未实现浮盈用（现价 - 持仓均价）* 剩余仓位。拉失败只影响「持仓浮盈」，静默。
    useEffect(() => {
        const controller = new AbortController();
        fetchHoldings({ signal: controller.signal })
            .then((res) => {
                if (controller.signal.aborted) return;
                const list = res.holdings || [];
                setHoldings(list);
                writeHoldingsCache(list);
            })
            .catch(() => {
                // 浮盈是附加信息，拉失败就只显示已实现盈亏，不 Toast
            });
        return () => controller.abort();
    }, []);

    // 逐个补现价：优先用会话缓存里够新的价（首页卡片刚拉过就直接命中），否则后台拉一次。
    // 复用首页那套报价缓存与新鲜度阈值，缺价的持仓浮盈按 0 计，单个失败静默、不影响其余。
    useEffect(() => {
        if (holdings.length === 0) return;
        const controller = new AbortController();
        const symbols = Array.from(new Set(holdings.map((h) => symbolKey(h.item_symbol)).filter(Boolean)));

        const seeded: Record<string, number> = {};
        for (const sym of symbols) {
            const cached = readQuoteCache(sym);
            if (cached?.price != null) seeded[sym] = cached.price;
        }
        if (Object.keys(seeded).length > 0) {
            setQuotePrices((prev) => ({ ...seeded, ...prev }));
        }

        for (const sym of symbols) {
            const cached = readQuoteCache(sym);
            const fresh =
                cached?.price != null &&
                cached.fetchedAt != null &&
                Date.now() - cached.fetchedAt <= QUOTE_STALE_AFTER_MS;
            if (fresh) continue;
            fetchQuote(sym, { signal: controller.signal })
                .then((next) => {
                    if (controller.signal.aborted) return;
                    writeQuoteCache(sym, { price: next.price, fetchedAt: next.fetchedAt ?? Date.now(), error: null });
                    setQuotePrices((prev) => ({ ...prev, [sym]: next.price }));
                })
                .catch(() => {
                    // 单个标的取价失败静默
                });
        }
        return () => controller.abort();
    }, [holdings]);

    // 计算当前选中的日期边界（仅资产分析用）
    const bounds = useMemo(
        () => getChartRangeBounds(rangeKey, customStart, customEnd),
        [rangeKey, customStart, customEnd]
    );

    // 全部时间的已实现盈亏 + 排行 + 胜率（盈亏分析不带日期筛选）
    const overall = useMemo(() => {
        let totalPnl = 0;
        let profitSum = 0;
        let lossSum = 0;
        let winning = 0;
        let losing = 0;
        const rankingMap = new Map<
            number,
            { id: number; name: string; profit: number; lastSellPrice: number; lastSellTime: string; lastSellId: number }
        >();

        for (const t of trades) {
            const recs = t.sell_records || [];
            let tradeProfit = 0;
            for (const rec of recs) {
                const profit = (rec.sell_price - t.current_price) * rec.sell_quantity;
                tradeProfit += profit;
                totalPnl += profit;

                const prev = rankingMap.get(t.item_id);
                if (prev) {
                    prev.profit += profit;
                    // 「最近一次卖出」与服务端 SQL / 走势页共用同一口径（sell_time 再 id 兜底）
                    if (isLaterSell(rec, { sell_time: prev.lastSellTime, id: prev.lastSellId })) {
                        prev.lastSellTime = rec.sell_time;
                        prev.lastSellPrice = rec.sell_price;
                        prev.lastSellId = rec.id;
                    }
                } else {
                    rankingMap.set(t.item_id, {
                        id: t.item_id,
                        name: t.item_name,
                        profit,
                        lastSellPrice: rec.sell_price,
                        lastSellTime: rec.sell_time,
                        lastSellId: rec.id,
                    });
                }
            }
            if (tradeProfit > 0) {
                winning++;
                profitSum += tradeProfit;
            } else if (tradeProfit < 0) {
                losing++;
                lossSum += tradeProfit;
            }
        }

        const totalTrades = winning + losing;
        const winRate = totalTrades > 0 ? ((winning / totalTrades) * 100).toFixed(1) : '0';
        const ranking = Array.from(rankingMap.values()).sort((a, b) => b.profit - a.profit);
        return { totalPnl, profitSum, lossSum, winRate, ranking };
    }, [trades]);

    // 当前持仓的未实现浮盈：Σ (现价 - 持仓均价) * 剩余仓位，缺现价 / 无代码的跳过
    const unrealizedPnl = useMemo(() => {
        let sum = 0;
        for (const h of holdings) {
            const sym = symbolKey(h.item_symbol);
            if (!sym) continue;
            const price = quotePrices[sym];
            if (price == null) continue;
            const qty = h.remaining_qty || 0;
            if (qty <= 0) continue;
            sum += (price - h.weighted_avg_price) * qty;
        }
        return sum;
    }, [holdings, quotePrices]);

    // 持仓浮盈 = 累计已实现 + 当前持仓未实现（整个账户口径）
    const holdingFloatPnl = overall.totalPnl + unrealizedPnl;

    // 收益折线图：按所选区间聚合每日已实现盈亏，累加成曲线（资产分析）
    const trend = useMemo(() => {
        const daily = new Map<string, number>();
        for (const t of trades) {
            for (const rec of t.sell_records || []) {
                if (!isTimeInRange(rec.sell_time, bounds.start, bounds.end)) continue;
                const profit = (rec.sell_price - t.current_price) * rec.sell_quantity;
                const day = rec.sell_time.slice(0, 10);
                daily.set(day, (daily.get(day) || 0) + profit);
            }
        }
        const days = enumerateDays(bounds.start, bounds.end);
        let cumulative = 0;
        return days.map((date) => {
            cumulative += daily.get(date) || 0;
            return { date, value: cumulative };
        });
    }, [trades, bounds]);

    const hasClosedInRange = useMemo(
        () =>
            trades.some((t) =>
                (t.sell_records || []).some((r: any) => isTimeInRange(r.sell_time, bounds.start, bounds.end))
            ),
        [trades, bounds]
    );

    const hasAnyData = trades.length > 0 || holdings.length > 0;

    const handleRangeClick = (key: ChartRangeKey) => {
        if (key === 'custom') {
            setCalendarVisible(true);
            return;
        }
        setRangeKey(key);
    };

    const handleCalendarConfirm = (dates: [Date, Date]) => {
        if (dates[0] && dates[1]) {
            setCustomStart(formatDateStr(dates[0]));
            setCustomEnd(formatDateStr(dates[1]));
            setCustomApplied(true);
            setRangeKey('custom');
            setCalendarVisible(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.pageTitle}>图表</div>

            {/* 顶部两个 tab：盈亏分析 / 资产分析。自绘切换，避开 antd 样式插入顺序坑 */}
            <div className={styles.tabBar}>
                <button
                    type="button"
                    className={clsx(styles.tab, activeTab === 'pnl' && styles.tabActive)}
                    onClick={() => setActiveTab('pnl')}
                >
                    盈亏分析
                </button>
                <button
                    type="button"
                    className={clsx(styles.tab, activeTab === 'asset' && styles.tabActive)}
                    onClick={() => setActiveTab('asset')}
                >
                    资产分析
                </button>
            </div>

            {loading ? (
                <div className={styles.loading}>
                    <SpinLoading color="currentColor" />
                    加载中
                </div>
            ) : activeTab === 'pnl' ? (
                !hasAnyData ? (
                    <EmptyState
                        icon={ChartNoAxesColumn}
                        title="暂无交易记录"
                        description="记录买入或卖出后再来看盈亏分析"
                    />
                ) : (
                    <div className={styles.body}>
                        {/* 盈亏模块：左累计盈亏（已实现），右持仓浮盈（已实现 + 当前浮盈） */}
                        <div className={styles.pnlModule}>
                            <div className={styles.pnlBlock}>
                                <span className={styles.pnlLabel}>累计盈亏</span>
                                <span className={clsx(styles.pnlValue, pnlClass(overall.totalPnl))}>
                                    {signed(overall.totalPnl)}
                                </span>
                            </div>
                            <div className={styles.pnlDivider} />
                            <div className={styles.pnlBlock}>
                                <span className={styles.pnlLabel}>持仓浮盈</span>
                                <span className={clsx(styles.pnlValue, pnlClass(holdingFloatPnl))}>
                                    {signed(holdingFloatPnl)}
                                </span>
                            </div>
                        </div>

                        {/* 累计盈利 / 累计亏损 / 交易胜率 */}
                        <div className={styles.summaryModule}>
                            <div className={styles.summaryBlock}>
                                <span className={styles.summaryLabel}>累计盈利</span>
                                <span className={clsx(styles.summaryValue, styles.up)}>
                                    {signed(overall.profitSum)}
                                </span>
                            </div>
                            <div className={styles.summaryDivider} />
                            <div className={styles.summaryBlock}>
                                <span className={styles.summaryLabel}>累计亏损</span>
                                <span className={clsx(styles.summaryValue, styles.down)}>
                                    {signed(overall.lossSum)}
                                </span>
                            </div>
                            <div className={styles.summaryDivider} />
                            <div className={styles.summaryBlock}>
                                <span className={styles.summaryLabel}>交易胜率</span>
                                <span className={styles.summaryValue}>{overall.winRate + '%'}</span>
                            </div>
                        </div>

                        {/* 盈亏排行 */}
                        <div className={styles.rankCard}>
                            <div className={styles.rankTitle}>盈亏排行</div>
                            {overall.ranking.length === 0 ? (
                                <div className={styles.rankEmpty}>暂无卖出记录</div>
                            ) : (
                                overall.ranking.map((row) => (
                                    <div key={row.id} className={styles.rankRow}>
                                        <span className={styles.rankName}>{row.name}</span>
                                        <div className={styles.rankRight}>
                                            <span className={styles.rankLastSell}>
                                                最近卖出 {row.lastSellPrice.toFixed(2)}
                                            </span>
                                            <span className={clsx(styles.rankValue, pnlClass(row.profit))}>
                                                {signed(row.profit)}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )
            ) : (
                <>
                    {/* 日期切换 */}
                    <div className={styles.rangeBar}>
                        {CHART_RANGE_OPTIONS.map((opt) => {
                            const active = rangeKey === opt.key;
                            const label =
                                opt.key === 'custom' && customApplied
                                    ? formatRangeChip(customStart, customEnd)
                                    : opt.label;
                            return (
                                <div
                                    key={opt.key}
                                    onClick={() => handleRangeClick(opt.key)}
                                    className={clsx(styles.rangeChip, active && styles.rangeChipActive)}
                                >
                                    {label}
                                </div>
                            );
                        })}
                    </div>

                    {/* 收益折线图 */}
                    {!hasClosedInRange ? (
                        <EmptyState
                            icon={ChartNoAxesColumn}
                            title="该时间范围内暂无已平仓记录"
                            description="可切换时间范围，或记录卖出后再查看"
                        />
                    ) : (
                        <div className={styles.body}>
                            <div className={styles.chartCard}>
                                <PnlTrendChart points={trend} />
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* antd-mobile 范围选择日历（资产分析的日期选择用） */}
            <Popup
                visible={calendarVisible}
                onMaskClick={() => setCalendarVisible(false)}
                position="bottom"
                bodyClassName={styles.calendarPopup}
            >
                <Calendar
                    selectionMode="range"
                    onChange={(val) => {
                        if (val && val.length === 2 && val[0] && val[1]) {
                            handleCalendarConfirm(val as [Date, Date]);
                        }
                    }}
                />
            </Popup>
        </div>
    );
}

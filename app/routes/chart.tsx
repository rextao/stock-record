import { useMemo, useState } from 'react'
import { useLoaderData } from 'react-router'
import { Popup, Calendar } from 'antd-mobile'
import { ChartNoAxesColumn } from 'lucide-react'
import clsx from 'clsx'
import PnlTrendChart from '../features/stock-chart/components/PnlTrendChart'
import { EmptyState } from '../common/components/EmptyState'
import { fetchTrades } from '../api/trading'
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

type Tone = 'default' | 'up' | 'down';

const toneClass = (tone: Tone) => (tone === 'up' ? styles.up : tone === 'down' ? styles.down : undefined);

const pnlClass = (value: number) => (value >= 0 ? styles.up : styles.down);

// 日期格式化：将 Date 对象转为 YYYY-MM-DD
const formatDateStr = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ==========================================
// 客户端数据加载：一次性拉取所有交易及卖出记录
// ==========================================
export async function clientLoader({ request }: { request: Request }) {
    // /api/trades 会将对应的 sell_records 也带出来
    return fetchTrades({ signal: request.signal });
}

// ==========================================
// 客户端组件
// ==========================================
export default function ChartRoute() {
    const loaderData = useLoaderData<typeof clientLoader>();
    const trades = loaderData?.trades || [];

    const [rangeKey, setRangeKey] = useState<ChartRangeKey>('all');
    const [customStart, setCustomStart] = useState(CHART_ALL_START);
    const [customEnd, setCustomEnd] = useState(todayDate());
    const [calendarVisible, setCalendarVisible] = useState(false);
    const [customApplied, setCustomApplied] = useState(false);

    // 计算当前选中的日期边界
    const bounds = useMemo(
        () => getChartRangeBounds(rangeKey, customStart, customEnd),
        [rangeKey, customStart, customEnd]
    );

    // 在客户端实时过滤与统计
    const stats = useMemo(() => {
        const closedTrades = trades.filter((t: any) => {
            if (t.actual_price === null && (!t.sell_records || t.sell_records.length === 0)) return false;
            // 只要有任何一笔卖出发生在范围内，就计入（兼容部分平仓的统计）
            const recs = t.sell_records || [];
            return recs.some((r: any) => isTimeInRange(r.sell_time, bounds.start, bounds.end));
        });

        let totalPnl = 0;
        let winningTradesCount = 0;
        let losingTradesCount = 0;
        const rankingMap = new Map<number, { id: number; name: string; profit: number }>();
        const daily = new Map<string, number>();

        // 遍历所有卖出记录，只统计在所选时间范围内的真实平仓收益
        for (const t of trades) {
            const recs = t.sell_records || [];
            let tradeProfitInRange = 0;

            for (const rec of recs) {
                if (!isTimeInRange(rec.sell_time, bounds.start, bounds.end)) continue;
                const profit = (rec.sell_price - t.current_price) * rec.sell_quantity;
                tradeProfitInRange += profit;
                totalPnl += profit;

                // 按天聚合（用于折线图）
                const day = rec.sell_time.slice(0, 10);
                daily.set(day, (daily.get(day) || 0) + profit);

                // 按标的聚合（用于排行榜）
                const prev = rankingMap.get(t.item_id);
                if (prev) {
                    prev.profit += profit;
                } else {
                    rankingMap.set(t.item_id, { id: t.item_id, name: t.item_name, profit });
                }
            }

            // 统计这笔交易（在该时间段内）是赚是亏
            if (tradeProfitInRange > 0) winningTradesCount++;
            else if (tradeProfitInRange < 0) losingTradesCount++;
        }

        const totalTradesCount = winningTradesCount + losingTradesCount;
        const winRate = totalTradesCount > 0 ? ((winningTradesCount / totalTradesCount) * 100).toFixed(1) : '0';
        const ranking = Array.from(rankingMap.values()).sort((a, b) => b.profit - a.profit);

        // 组装趋势图数据点
        const days = enumerateDays(bounds.start, bounds.end);
        let cumulative = 0;
        const trend = days.map((date) => {
            cumulative += daily.get(date) || 0;
            return { date, value: cumulative };
        });

        return {
            totalTrades: totalTradesCount,
            winningTrades: winningTradesCount,
            losingTrades: losingTradesCount,
            winRate,
            totalPnl,
            ranking,
            trend,
        };
    }, [trades, bounds]);

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

    // 渲染统计方块辅助组件
    const StatBlock = ({ label, value, tone = 'default' }: { label: string; value: string; tone?: Tone }) => (
        <div className={styles.statBlock}>
            <span className={styles.statLabel}>{label}</span>
            <span className={clsx(styles.statValue, toneClass(tone))}>{value}</span>
        </div>
    );

    return (
        <div className={styles.page}>
            <div className={styles.pageTitle}>图表</div>

            {/* 横向滚动的时间区间选择器 */}
            <div className={styles.rangeBar}>
                {CHART_RANGE_OPTIONS.map((opt) => {
                    const active = rangeKey === opt.key;
                    const label = opt.key === 'custom' && customApplied ? formatRangeChip(customStart, customEnd) : opt.label;
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

            {stats.totalTrades === 0 ? (
                <EmptyState
                    icon={ChartNoAxesColumn}
                    title="该时间范围内暂无已平仓记录"
                    description="可切换时间范围，或记录卖出后再查看"
                />
            ) : (
                <div className={styles.body}>

                    {/* 4宫格核心数据 */}
                    <div className={styles.statGrid}>
                        <StatBlock label="总交易" value={`${stats.totalTrades}笔`} />
                        <StatBlock label="胜率" value={`${stats.winRate}%`} />
                        <StatBlock label="盈利" value={`${stats.winningTrades}笔`} tone="up" />
                        <StatBlock label="亏损" value={`${stats.losingTrades}笔`} tone="down" />
                    </div>

                    {/* 累计收益 */}
                    <div className={styles.totalCard}>
                        <span className={styles.totalLabel}>累计收益绝对值</span>
                        <span className={clsx(styles.totalValue, pnlClass(stats.totalPnl))}>
                            {stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl.toFixed(2)}
                        </span>
                    </div>

                    {/* 趋势折线图 */}
                    <div className={styles.chartCard}>
                        <PnlTrendChart points={stats.trend} />
                    </div>

                    {/* 盈亏排行榜 */}
                    <div className={styles.rankCard}>
                        <div className={styles.rankTitle}>盈亏排行</div>
                        {stats.ranking.length === 0 ? (
                            <div className={styles.rankEmpty}>该时间范围内暂无卖出记录</div>
                        ) : (
                            stats.ranking.map((row) => (
                                <div key={row.id} className={styles.rankRow}>
                                    <span className={styles.rankName}>{row.name}</span>
                                    <span className={clsx(styles.rankValue, pnlClass(row.profit))}>
                                        {row.profit >= 0 ? '+' : ''}{row.profit.toFixed(2)}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* antd-mobile 提供的优雅范围选择日历 */}
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

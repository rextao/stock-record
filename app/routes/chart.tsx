import { useMemo, useState } from 'react'
import { useLoaderData } from 'react-router'
import { Popup, Calendar } from 'antd-mobile'
import { ChartNoAxesColumn } from 'lucide-react'
import { TradingDB } from '../server/db/client.server'
import PnlTrendChart from '../features/stock-chart/components/PnlTrendChart'

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

// 日期格式化：将 Date 对象转为 YYYY-MM-DD
const formatDateStr = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ==========================================
// 服务端逻辑：一次性拉取所有交易及卖出记录
// ==========================================
export async function loader({ context }: { context: any }) {
    const db = new TradingDB(context.cloudflare.env.DB);
    // getAllTrades 会将对应的 sell_records 也带出来
    const trades = await db.getAllTrades();
    return { trades };
}

// ==========================================
// 客户端组件
// ==========================================
export default function ChartRoute() {
    const loaderData = useLoaderData<typeof loader>();
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
    const StatBlock = ({ label, value, color = '#F8F9FA' }: { label: string, value: string, color?: string }) => (
        <div style={{ flex: 1, minWidth: '40%', backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: '#6D6F7E', marginBottom: '8px' }}>{label}</span>
            <span style={{ fontSize: '20px', fontWeight: 600, color }}>{value}</span>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#fff', paddingBottom: '100px' }}>
            <div style={{ padding: '16px 24px 12px', fontSize: '24px', fontWeight: 600 }}>图表</div>

            {/* 横向滚动的时间区间选择器 */}
            <div style={{ padding: '0 16px', marginBottom: '16px', overflowX: 'auto', display: 'flex', whiteSpace: 'nowrap', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                {CHART_RANGE_OPTIONS.map((opt) => {
                    const active = rangeKey === opt.key;
                    const label = opt.key === 'custom' && customApplied ? formatRangeChip(customStart, customEnd) : opt.label;
                    return (
                        <div
                            key={opt.key}
                            onClick={() => handleRangeClick(opt.key)}
                            style={{
                                flexShrink: 0, padding: '6px 16px', marginRight: '8px',
                                border: `1px solid ${active ? '#6C5CE7' : '#1A1C24'}`,
                                backgroundColor: active ? '#6C5CE7' : '#0B0C11',
                                color: active ? '#fff' : '#F8F9FA',
                                borderRadius: '20px', fontSize: '14px', transition: 'all 0.2s'
                            }}
                        >
                            {label}
                        </div>
                    );
                })}
            </div>

            {stats.totalTrades === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
                    <ChartNoAxesColumn size={56} color="#A855F7" style={{ marginBottom: '20px' }} />
                    <div style={{ fontSize: '18px', fontWeight: 600 }}>该时间范围内暂无已平仓记录</div>
                    <div style={{ fontSize: '14px', color: '#6D6F7E', marginTop: '8px' }}>可切换时间范围，或记录卖出后再查看</div>
                </div>
            ) : (
                <div style={{ padding: '0 16px' }}>

                    {/* 4宫格核心数据 */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                        <StatBlock label="总交易" value={`${stats.totalTrades}笔`} />
                        <StatBlock label="胜率" value={`${stats.winRate}%`} />
                        <StatBlock label="盈利" value={`${stats.winningTrades}笔`} color="#FF5252" />
                        <StatBlock label="亏损" value={`${stats.losingTrades}笔`} color="#00E676" />
                    </div>

                    {/* 累计收益 */}
                    <div style={{ backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '16px', color: '#9CA3AF', marginBottom: '8px' }}>累计收益绝对值</span>
                        <span style={{ fontSize: '32px', fontWeight: 700, color: stats.totalPnl >= 0 ? '#FF5252' : '#00E676' }}>
                            {stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl.toFixed(2)}
                        </span>
                    </div>

                    {/* 趋势折线图 */}
                    <div style={{ backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '16px', padding: '16px', marginBottom: '12px' }}>
                        <PnlTrendChart points={stats.trend} />
                    </div>

                    {/* 盈亏排行榜 */}
                    <div style={{ backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '16px', padding: '16px' }}>
                        <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '12px' }}>盈亏排行</div>
                        {stats.ranking.length === 0 ? (
                            <div style={{ color: '#6D6F7E', fontSize: '14px' }}>该时间范围内暂无卖出记录</div>
                        ) : (
                            stats.ranking.map((row) => (
                                <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #1A1C24' }}>
                                    <span style={{ fontSize: '16px' }}>{row.name}</span>
                                    <span style={{ fontSize: '16px', fontWeight: 600, color: row.profit >= 0 ? '#FF5252' : '#00E676' }}>
                                        {row.profit >= 0 ? '+' : ''}{row.profit.toFixed(2)}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* antd-mobile 提供的优雅范围选择日历 */}
            <Popup visible={calendarVisible} onMaskClick={() => setCalendarVisible(false)} position="bottom" bodyStyle={{ borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
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

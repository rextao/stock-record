import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const formatPrice = (val: number) => val.toFixed(2);
// 缩短时间格式，仅显示 MM-DD HH:mm，适合列表展示
const formatShortTime = (timeStr: string) => timeStr ? timeStr.slice(5, 16) : '--';

export function HoldingCard({ holding }: { holding: any }) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div style={{ padding: '16px', backgroundColor: 'var(--card-bg-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{holding.item_name}</span>
                    {/* 改动 3：拼接笔数与剩余仓位 */}
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {holding.trade_count}笔持仓 (余 {holding.remaining_qty} 仓)
                    </span>
                </div>
                {holding.live_price && (
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                        现价: <span style={{ fontFamily: 'monospace' }}>{formatPrice(holding.live_price)}</span>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>剩余持仓</span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{holding.remaining_qty}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>加权均价</span>
                    <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)' }}>{formatPrice(holding.weighted_avg_price)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>累计平仓盈亏</span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: holding.realized_pnl >= 0 ? '#FF5252' : '#00E676' }}>
                        {holding.realized_pnl >= 0 ? '+' : ''}{holding.realized_pnl.toFixed(2)}
                    </span>
                </div>
            </div>

            {/* 底部栏：仅保留靠右的展开/收起箭头 */}
            {holding.sub_trades.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <div
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                        style={{ padding: '4px 0 4px 16px', cursor: 'pointer' }}
                    >
                        {expanded ? <ChevronUp size={20} color="#A855F7" /> : <ChevronDown size={20} color="#A855F7" />}
                    </div>
                </div>
            )}

            {expanded && holding.sub_trades.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                    {holding.sub_trades.map((st: any) => {
                        const upside = st.current_price > 0 ? ((st.target_price - st.current_price) / st.current_price) * 100 : 0;
                        const downside = st.current_price > 0 ? ((st.current_price - st.stop_loss_price) / st.current_price) * 100 : 0;

                        const hasLive = holding.live_price != null;
                        const livePnlAmount = hasLive ? (holding.live_price - st.current_price) * st.remaining : 0;
                        const livePnlPct = hasLive && st.current_price > 0 ? ((holding.live_price - st.current_price) / st.current_price) * 100 : 0;
                        // 改动 4：计算单仓/单股价差
                        const livePnlPerShare = hasLive ? holding.live_price - st.current_price : 0;

                        return (
                            <div key={st.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>

                                {/* 改动 1：左侧新增购入时间 */}
                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: '85px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', letterSpacing: '0.5px' }}>
                                        {formatShortTime(st.buy_time)}
                                    </span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>入: </span>{formatPrice(st.current_price)}
                                    </span>
                                    <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>仓: </span>{Math.floor(st.remaining)}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', textAlign: 'right', flex: 1, justifyContent: 'flex-end' }}>

                                    {/* 1. 预期列 */}
                                    <div style={{ display: 'flex', flexDirection: 'column', opacity: 0.7, minWidth: '50px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' }}>预期</span>
                                        <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{formatPrice(st.target_price)}</span>
                                        <span style={{ fontSize: '11px', color: upside >= 0 ? '#FF5252' : '#00E676' }}>{upside >= 0 ? '+' : ''}{upside.toFixed(1)}%</span>
                                    </div>

                                    {/* 3. 止损列 (把止损提到前面，中间留给当前收益，逻辑更连贯) */}
                                    <div style={{ display: 'flex', flexDirection: 'column', opacity: 0.7, minWidth: '50px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' }}>止损</span>
                                        <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{formatPrice(st.stop_loss_price)}</span>
                                        <span style={{ fontSize: '11px', color: '#00E676' }}>{-downside.toFixed(1)}%</span>
                                    </div>

                                    {/* 2. 当前浮动收益列 (高亮显示 + 单仓明细) */}
                                    <div style={{
                                        display: 'flex', flexDirection: 'column',
                                        backgroundColor: hasLive ? 'rgba(108,92,231,0.08)' : 'transparent',borderRadius: '6px', minWidth: '70px', alignItems: 'flex-end'
                                    }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' }}>当前盈亏</span>
                                        {hasLive ? (
                                            <>
                                                <span style={{ fontSize: '14px', fontWeight: 600, color: livePnlAmount >= 0 ? '#FF5252' : '#00E676' }}>
                                                    {livePnlAmount >= 0 ? '+' : ''}{livePnlAmount.toFixed(0)}
                                                </span>
                                                {/*<span style={{ fontSize: '12px', fontWeight: 500, color: livePnlPct >= 0 ? '#FF5252' : '#00E676' }}>*/}
                                                {/*    {livePnlPct >= 0 ? '+' : ''}{livePnlPct.toFixed(1)}%*/}
                                                {/*</span>*/}
                                                {/* 改动 4：新增单仓差价展示 */}
                                                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                    单仓 {livePnlPerShare >= 0 ? '+' : ''}{livePnlPerShare.toFixed(2)}
                                                </span>
                                            </>
                                        ) : (
                                            <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '2px' }}>--</span>
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

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// 简单的格式化工具函数
const formatPrice = (val: number) => val.toFixed(2);
const formatTime = (timeStr: string) => timeStr ? timeStr.slice(0, 16) : '--';

export function HoldingCard({ holding }: { holding: any }) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div style={{ padding: '16px', backgroundColor: '#0B0C11' }}>
            {/* 顶部：标的名称与笔数 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 600, color: '#F8F9FA' }}>{holding.item_name}</span>
                    <span style={{ fontSize: '12px', color: '#6D6F7E' }}>{holding.trade_count}笔持仓</span>
                </div>
            </div>

            {/* 中间：核心数据列 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '12px', color: '#6D6F7E', marginBottom: '4px' }}>剩余持仓</span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#F8F9FA' }}>{holding.remaining_qty}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#6D6F7E', marginBottom: '4px' }}>加权均价</span>
                    <span style={{ fontSize: '16px', fontWeight: 500, color: '#F8F9FA' }}>{formatPrice(holding.weighted_avg_price)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '12px', color: '#6D6F7E', marginBottom: '4px' }}>累计盈亏</span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: holding.realized_pnl >= 0 ? '#FF5252' : '#00E676' }}>
                        {holding.realized_pnl >= 0 ? '+' : ''}{holding.realized_pnl.toFixed(2)}
                    </span>
                </div>
            </div>

            {/* 底部栏：最近买入时间 & 展开控制 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <span style={{ fontSize: '12px', color: '#6D6F7E' }}>
                    最近买入 {holding.sub_trades[0] ? formatTime(holding.sub_trades[0].buy_time) : '--'}
                </span>
                {holding.sub_trades.length > 0 && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation(); // 关键修复：阻止事件冒泡，防止触发卡片的跳转
                            setExpanded(!expanded);
                        }}
                        style={{ padding: '4px' }}
                    >
                        {expanded ? <ChevronUp size={16} color="#A855F7" /> : <ChevronDown size={16} color="#A855F7" />}
                    </div>
                )}
            </div>

            {/* 子交易列表 (展开态) */}
            {expanded && holding.sub_trades.length > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #1A1C24' }}>
                    {holding.sub_trades.map((st: any) => {
                        const upside = st.current_price > 0 ? ((st.target_price - st.current_price) / st.current_price) * 100 : 0;
                        const downside = st.current_price > 0 ? ((st.current_price - st.stop_loss_price) / st.current_price) * 100 : 0;
                        const rewardRisk = (st.current_price - st.stop_loss_price) > 0
                            ? ((st.target_price - st.current_price) / (st.current_price - st.stop_loss_price)).toFixed(2)
                            : '∞';

                        return (
                            <div key={st.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1A1C24' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '12px', color: '#6D6F7E', marginBottom: '4px' }}>{formatTime(st.buy_time)}</span>
                                    <span style={{ fontSize: '14px', color: '#F8F9FA' }}>仓位：{Math.floor(st.remaining)}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '16px', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '12px', color: '#6D6F7E' }}>预期</span>
                                        <span style={{ fontSize: '14px', color: '#F8F9FA' }}>{formatPrice(st.target_price)}</span>
                                        <span style={{ fontSize: '12px', color: upside >= 0 ? '#FF5252' : '#00E676' }}>{upside >= 0 ? '+' : ''}{upside.toFixed(2)}%</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '12px', color: '#6D6F7E' }}>止损</span>
                                        <span style={{ fontSize: '14px', color: '#F8F9FA' }}>{formatPrice(st.stop_loss_price)}</span>
                                        <span style={{ fontSize: '12px', color: -downside >= 0 ? '#FF5252' : '#00E676' }}>{-downside >= 0 ? '+' : ''}{-downside.toFixed(2)}%</span>
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

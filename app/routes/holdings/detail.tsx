import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { NavBar, Toast } from "antd-mobile";
import { ChevronRight } from "lucide-react";
import { SellModal } from "../../features/trade-record/components/SellModal";
import { fetchHoldingDetail, sellByItem } from "../../api/trading";
// 简单的日期和价格格式化
const formatPrice = (val: number) => val?.toFixed(2);
const formatDateTime = (val: string) => val ? val.slice(0, 16) : '--';

// 数据组装在 Worker 的 /api/holdings/:id 里完成，这里只负责取回来
export async function clientLoader({ params, request }: { params: any, request: Request }) {
    return fetchHoldingDetail(Number(params.id), { signal: request.signal });
}

export async function clientAction({ request }: { request: Request }) {
    const formData = await request.formData();

    try {
        await sellByItem({
            itemId: Number(formData.get("itemId")),
            price: Number(formData.get("price")),
            qty: Number(formData.get("qty")),
        });
        return { success: true };
    } catch (error: any) {
        return { error: error.message as string };
    }
}

export default function HoldingsDetailRoute() {
    const { holding, openTrades, closedTrades } = useLoaderData<typeof clientLoader>();
    const navigate = useNavigate();
    const [sellHolding, setSellHolding] = useState<any>(null);
    const fetcher = useFetcher();

    // 渲染单张交易卡片
    const renderTradeCard = (t: any) => {
        const isClosed = t.sold_quantity >= t.buy_quantity;
        const isPartial = t.sold_quantity > 0 && !isClosed;

        return (
            <div key={t.id} onClick={() => navigate(`/trade/${t.id}`)} style={{ backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '16px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ color: '#6D6F7E', fontSize: '14px' }}>买入时间 {formatDateTime(t.buy_time)}</div>
                    <div style={{
                        fontSize: '12px', padding: '4px 8px', borderRadius: '6px',
                        backgroundColor: isClosed ? 'rgba(255,255,255,0.06)' : isPartial ? 'rgba(168,85,247,0.15)' : 'rgba(34,197,94,0.15)',
                        color: isClosed ? '#9CA3AF' : isPartial ? '#A855F7' : '#00E676'
                    }}>
                        {isClosed ? '已平仓' : isPartial ? '部分平仓' : '未平仓'}
                    </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 0' }}>
                    <div style={{ width: '50%' }}><div style={{ fontSize: '12px', color: '#6D6F7E' }}>买入价格</div><div style={{ fontSize: '16px', color: '#F8F9FA' }}>{formatPrice(t.current_price)}</div></div>
                    <div style={{ width: '50%' }}><div style={{ fontSize: '12px', color: '#6D6F7E' }}>买入仓位</div><div style={{ fontSize: '16px', color: '#F8F9FA' }}>{t.buy_quantity}</div></div>
                    {!isClosed && t.sold_quantity > 0 && (
                        <div style={{ width: '100%', fontSize: '14px', color: '#6D6F7E', marginTop: '-4px' }}>剩余仓位 {t.remaining}</div>
                    )}
                </div>

                {t.sell_records.length > 0 && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #1A1C24' }}>
                        <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '8px' }}>卖出记录（{t.sell_records.length}）</div>
                        {t.sell_records.map((r: any) => {
                            const pnl = (r.sell_price - t.current_price) * r.sell_quantity;
                            return (
                                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                    <div style={{ color: '#6D6F7E', fontSize: '12px' }}>{formatDateTime(r.sell_time)} · 仓位 {r.sell_quantity}</div>
                                    <div style={{ color: pnl >= 0 ? '#FF5252' : '#00E676', fontSize: '14px', fontWeight: 500 }}>
                                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#fff' }}>
            <NavBar onBack={() => navigate(-1)} style={{ '--border-bottom': '1px solid #1A1C24', backgroundColor: '#000000' }}>
                {holding.item_name}
            </NavBar>

            <div style={{ padding: '16px', paddingBottom: '80px' }}>
                {/* 汇总卡 */}
                <div style={{ backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <span style={{ fontSize: '20px', fontWeight: 600 }}>{holding.item_name}</span>
                        {holding.remaining_qty > 0 && (
                            <div
                                onClick={() => setSellHolding(holding)}
                                style={{ padding: '6px 14px', borderRadius: '20px', border: '1px solid #00E676', backgroundColor: 'rgba(34,197,94,0.12)', color: '#00E676', fontSize: '12px', fontWeight: 500 }}
                            >记录卖出</div>
                        )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center' }}>
                        <div><div style={{ fontSize: '14px', color: '#6D6F7E' }}>剩余持仓</div><div style={{ fontSize: '18px', fontWeight: 600 }}>{holding.remaining_qty}</div></div>
                        <div><div style={{ fontSize: '14px', color: '#6D6F7E' }}>加权均价</div><div style={{ fontSize: '18px', fontWeight: 600 }}>{formatPrice(holding.weighted_avg_price)}</div></div>
                        <div><div style={{ fontSize: '14px', color: '#6D6F7E' }}>累计盈亏</div>
                            <div style={{ fontSize: '18px', fontWeight: 600, color: holding.realized_pnl >= 0 ? '#FF5252' : '#00E676' }}>
                                {holding.realized_pnl >= 0 ? '+' : ''}{holding.realized_pnl.toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ fontSize: '16px', color: '#6D6F7E', margin: '16px 0 12px' }}>未平仓（{openTrades.length}）</div>
                {openTrades.map(renderTradeCard)}

                <div style={{ fontSize: '16px', color: '#6D6F7E', margin: '24px 0 12px' }}>已平仓（{closedTrades.length}）</div>
                {closedTrades.map(renderTradeCard)}
            </div>
            <SellModal
                visible={!!sellHolding}
                holding={sellHolding}
                onClose={() => setSellHolding(null)}
                onConfirm={(price, qty) => {
                    fetcher.submit(
                        { intent: 'sell', itemId: sellHolding.item_id, price: String(price), qty: String(qty) },
                        { method: 'post' }
                    );
                    setSellHolding(null);
                }}
            />
        </div>
    );
}

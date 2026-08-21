import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { NavBar, Toast } from "antd-mobile";
import { ChevronRight } from "lucide-react";
import { TradingDB } from "../../server/db/client.server";
import { SellModal } from "../../features/trade-record/components/SellModal";
// 简单的日期和价格格式化
const formatPrice = (val: number) => val?.toFixed(2);
const formatDateTime = (val: string) => val ? val.slice(0, 16) : '--';

export async function loader({ params, context }: { params: any, context: any }) {
    const itemId = Number(params.id);
    const db = context.cloudflare.env.DB; // 直接使用 D1 实例


    // 1. 获取该标的下的所有交易
    const { results: trades } = await db.prepare(`
        SELECT t.*, i.name as item_name 
        FROM trades t LEFT JOIN items i ON t.item_id = i.id 
        WHERE t.item_id = ? ORDER BY t.buy_time DESC
    `).bind(itemId).all();

    // 2. 获取该标的下的所有卖出记录
    const { results: records } = await db.prepare(`
        SELECT r.* FROM sell_records r
        JOIN trades t ON r.trade_id = t.id
        WHERE t.item_id = ? ORDER BY r.sell_time ASC
    `).bind(itemId).all();

    // 3. 在服务端完成数据组装 (对应原有的 getHoldingsByItem 逻辑)
    const recordsMap = new Map();
    records.forEach((r: any) => {
        if (!recordsMap.has(r.trade_id)) recordsMap.set(r.trade_id, []);
        recordsMap.get(r.trade_id).push(r);
    });

    let remainingQty = 0;
    let weightedSum = 0;
    let realizedPnl = 0;
    const openTrades: any[] = [];
    const closedTrades: any[] = [];

    const enrichedTrades = trades.map((t: any) => {
        const recs = recordsMap.get(t.id) || [];
        const profit = recs.reduce((sum: number, r: any) => sum + (r.sell_price - t.current_price) * r.sell_quantity, 0);
        realizedPnl += profit;

        if (t.sold_quantity < t.buy_quantity) {
            const rem = t.buy_quantity - t.sold_quantity;
            remainingQty += rem;
            weightedSum += t.current_price * rem;
            openTrades.push({ ...t, sell_records: recs, profit, remaining: rem });
        } else {
            closedTrades.push({ ...t, sell_records: recs, profit, remaining: 0 });
        }
        return t;
    });

    const holding = {
        item_id: itemId,
        item_name: trades[0]?.item_name || '未知标的',
        remaining_qty: remainingQty,
        weighted_avg_price: remainingQty > 0 ? weightedSum / remainingQty : 0,
        realized_pnl: realizedPnl,
        sub_trades: openTrades // 给卖出弹窗用
    };

    return { holding, openTrades, closedTrades };
}

export async function action({ request, context }: { request: Request, context: any }) {
    const formData = await request.formData();
    const itemId = Number(formData.get("itemId"));
    const price = Number(formData.get("price"));
    const qty = Number(formData.get("qty"));

    const db = new TradingDB(context.cloudflare.env.DB);
    try {
        await db.recordSellByItem(itemId, price, qty);
        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export default function HoldingsDetailRoute() {
    const { holding, openTrades, closedTrades } = useLoaderData<typeof loader>();
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

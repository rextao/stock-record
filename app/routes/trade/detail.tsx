import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { NavBar, Input, Button, Dialog, Toast } from "antd-mobile";
import { deleteTrade, fetchTradeDetail, sellTrade } from "../../api/trading";

const formatPrice = (val: number) => val?.toFixed(2);
const formatPct = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
const formatDateTime = (val: string) => val ? val.slice(0, 16) : '--';

export async function clientLoader({ params, request }: { params: any, request: Request }) {
    return fetchTradeDetail(Number(params.id), { signal: request.signal });
}

export async function clientAction({ request }: { request: Request }) {
    const formData = await request.formData();
    const intent = formData.get("intent");
    const tradeId = Number(formData.get("tradeId"));

    try {
        if (intent === "sell") {
            return await sellTrade(tradeId, {
                price: Number(formData.get("price")),
                qty: Number(formData.get("qty")),
            });
        }

        if (intent === "delete") {
            return await deleteTrade(tradeId);
        }
    } catch (error: any) {
        return { error: error.message as string };
    }

    return null;
}

export default function TradeDetailRoute() {
    const { trade } = useLoaderData<typeof clientLoader>();
    const navigate = useNavigate();
    const fetcher = useFetcher();

    const [showSellForm, setShowSellForm] = useState(false);
    const [sellPrice, setSellPrice] = useState("");
    const [sellQty, setSellQty] = useState(String(trade.remaining));

    const isPartial = trade.sold_quantity > 0 && !trade.is_fully_closed;

    const handleRecordSell = () => {
        const price = parseFloat(sellPrice);
        const qty = parseFloat(sellQty);

        if (!price || price <= 0) {
            Toast.show("请输入有效的实际价格");
            return;
        }
        if (!qty || qty <= 0 || qty > trade.remaining) {
            Toast.show("卖出数量无效或超过剩余持仓");
            return;
        }

        fetcher.submit(
            { intent: "sell", tradeId: trade.id.toString(), price: String(price), qty: String(qty) },
            { method: "post" }
        );
        setShowSellForm(false);
        Toast.show({ icon: 'success', content: '卖出成功' });
    };

    const handleDelete = () => {
        Dialog.confirm({
            title: '删除记录',
            content: '确定删除这条交易记录吗？',
            confirmText: <span style={{ color: '#FF5252' }}>删除</span>,
            onConfirm: () => {
                fetcher.submit(
                    { intent: "delete", tradeId: trade.id.toString() },
                    { method: "post" }
                );
                Toast.show({ icon: 'success', content: '删除成功' });
                navigate(-1);
            },
        });
    };

    // 辅助信息行组件
    const InfoRow = ({ label, value, color = '#F8F9FA' }: { label: string, value: string, color?: string }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #1A1C24' }}>
            <span style={{ color: '#9CA3AF', fontSize: '16px' }}>{label}</span>
            <span style={{ color, fontSize: '16px', fontWeight: 500 }}>{value}</span>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#fff' }}>
            <NavBar onBack={() => navigate(-1)} style={{ '--border-bottom': '1px solid #1A1C24', backgroundColor: '#000000' }}>
                交易详情
            </NavBar>

            <div style={{ padding: '16px', paddingBottom: '80px' }}>
                {/* 顶部状态卡 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '16px', padding: '16px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 600 }}>{trade.item_name}</span>
                    <div>
                        {trade.is_fully_closed && <span style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.06)', color: '#9CA3AF', fontSize: '12px' }}>已平仓</span>}
                        {isPartial && <span style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(168,85,247,0.15)', color: '#A855F7', fontSize: '12px' }}>部分平仓</span>}
                    </div>
                </div>

                {/* 价格与持仓信息 */}
                <div style={{ backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '16px', padding: '16px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', color: '#6D6F7E', marginBottom: '8px' }}>核心信息</div>
                    <InfoRow label="当前价" value={formatPrice(trade.current_price)} />
                    <InfoRow label="预期价" value={formatPrice(trade.target_price)} />
                    <InfoRow label="止损价" value={formatPrice(trade.stop_loss_price)} />
                    <InfoRow label="剩余持仓" value={String(trade.remaining)} />
                </div>

                {/* 收益分析 */}
                <div style={{ backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '16px', padding: '16px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', color: '#6D6F7E', marginBottom: '8px' }}>收益分析</div>
                    <InfoRow label="预期涨幅" value={formatPct(trade.upside_pct)} color="#FF5252" />
                    <InfoRow label="预期跌幅" value={formatPct(-trade.downside_pct)} color="#00E676" />
                    {trade.actual_return_pct !== null && (
                        <InfoRow label="实际收益" value={formatPct(trade.actual_return_pct)} color={trade.actual_return_pct >= 0 ? '#FF5252' : '#00E676'} />
                    )}
                </div>

                {/* 卖出表单 / 按钮 */}
                {!trade.is_fully_closed && !showSellForm && (
                    <Button block onClick={() => setShowSellForm(true)} style={{ backgroundColor: '#00E676', color: '#000', border: 'none', borderRadius: '12px', height: '48px', fontSize: '16px', fontWeight: 600, marginTop: '12px' }}>
                        记录卖出
                    </Button>
                )}

                {showSellForm && (
                    <div style={{ backgroundColor: '#0B0C11', border: '1px solid #1A1C24', borderRadius: '16px', padding: '16px', marginTop: '12px' }}>
                        <div style={{ fontSize: '14px', color: '#9CA3AF', marginBottom: '8px' }}>卖出数量（剩余 {trade.remaining}）</div>
                        <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '16px' }}>
                            <Input type="number" value={sellQty} onChange={setSellQty} style={{ '--color': '#fff' }} />
                        </div>

                        <div style={{ fontSize: '14px', color: '#9CA3AF', marginBottom: '8px' }}>实际卖出价格</div>
                        <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '16px' }}>
                            <Input type="number" value={sellPrice} onChange={setSellPrice} placeholder="0.00" style={{ '--color': '#fff' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <Button block onClick={() => setShowSellForm(false)} style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#9CA3AF', border: 'none', borderRadius: '10px' }}>取消</Button>
                            <Button block onClick={handleRecordSell} style={{ backgroundColor: '#00E676', color: '#000', border: 'none', borderRadius: '10px', fontWeight: 600 }}>确认卖出</Button>
                        </div>
                    </div>
                )}

                <div onClick={handleDelete} style={{ textAlign: 'center', padding: '16px', marginTop: '24px', color: '#FF5252', fontSize: '16px' }}>
                    删除记录
                </div>
            </div>
        </div>
    );
}

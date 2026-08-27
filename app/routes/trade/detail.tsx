import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { NavBar, Input, Button, Dialog, Toast } from "antd-mobile";
import clsx from "clsx";
import { deleteTrade, fetchTradeDetail, sellTrade } from "../../api/trading";
import styles from "./detail.module.less";

const formatPrice = (val: number) => val?.toFixed(2);
const formatPct = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;

type Tone = 'default' | 'up' | 'down';

const toneClass = (tone: Tone) => (tone === 'up' ? styles.up : tone === 'down' ? styles.down : undefined);

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

// 辅助信息行。色值走语义 class，避免把主题色写进组件 props
function InfoRow({ label, value, tone = 'default' }: { label: string; value: string; tone?: Tone }) {
    return (
        <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{label}</span>
            <span className={clsx(styles.infoValue, toneClass(tone))}>{value}</span>
        </div>
    );
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
            confirmText: <span className={styles.dangerText}>删除</span>,
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

    return (
        <div className={styles.page}>
            <NavBar onBack={() => navigate(-1)} className={styles.navBar}>
                交易详情
            </NavBar>

            <div className={styles.content}>
                {/* 顶部状态卡 */}
                <div className={clsx(styles.card, styles.statusCard)}>
                    <span className={styles.itemName}>{trade.item_name}</span>
                    <div>
                        {trade.is_fully_closed && (
                            <span className={clsx(styles.pill, styles.pillClosed)}>已平仓</span>
                        )}
                        {isPartial && (
                            <span className={clsx(styles.pill, styles.pillPartial)}>部分平仓</span>
                        )}
                    </div>
                </div>

                {/* 价格与持仓信息 */}
                <div className={styles.card}>
                    <div className={styles.cardTitle}>核心信息</div>
                    <InfoRow label="当前价" value={formatPrice(trade.current_price)} />
                    <InfoRow label="预期价" value={formatPrice(trade.target_price)} />
                    <InfoRow label="止损价" value={formatPrice(trade.stop_loss_price)} />
                    <InfoRow label="剩余持仓" value={String(trade.remaining)} />
                </div>

                {/* 收益分析 */}
                <div className={styles.card}>
                    <div className={styles.cardTitle}>收益分析</div>
                    <InfoRow label="预期涨幅" value={formatPct(trade.upside_pct)} tone="up" />
                    <InfoRow label="预期跌幅" value={formatPct(-trade.downside_pct)} tone="down" />
                    {trade.actual_return_pct !== null && (
                        <InfoRow
                            label="实际收益"
                            value={formatPct(trade.actual_return_pct)}
                            tone={trade.actual_return_pct >= 0 ? 'up' : 'down'}
                        />
                    )}
                </div>

                {/* 卖出表单 / 按钮 */}
                {!trade.is_fully_closed && !showSellForm && (
                    <Button block onClick={() => setShowSellForm(true)} className={styles.sellButton}>
                        记录卖出
                    </Button>
                )}

                {showSellForm && (
                    <div className={clsx(styles.card, styles.sellForm)}>
                        <div className={styles.fieldLabel}>卖出数量（剩余 {trade.remaining}）</div>
                        <div className={styles.inputWrap}>
                            <Input type="number" value={sellQty} onChange={setSellQty} className={styles.input} />
                        </div>

                        <div className={styles.fieldLabel}>实际卖出价格</div>
                        <div className={styles.inputWrap}>
                            <Input
                                type="number"
                                value={sellPrice}
                                onChange={setSellPrice}
                                placeholder="0.00"
                                className={styles.input}
                            />
                        </div>

                        <div className={styles.actions}>
                            <Button block onClick={() => setShowSellForm(false)} className={styles.cancelButton}>
                                取消
                            </Button>
                            <Button block onClick={handleRecordSell} className={styles.confirmButton}>
                                确认卖出
                            </Button>
                        </div>
                    </div>
                )}

                <div onClick={handleDelete} className={styles.deleteAction}>
                    删除记录
                </div>
            </div>
        </div>
    );
}

import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { NavBar } from "antd-mobile";
import clsx from "clsx";
import { SellModal } from "../../features/trade-record/components/SellModal";
import { fetchHoldingDetail, sellByItem } from "../../api/trading";
import { formatLocalDateTime } from "../../utils/datetime";
import styles from "./detail.module.less";

// 简单的日期和价格格式化
const formatPrice = (val: number) => val?.toFixed(2);
// DB 里是 UTC 墙上时间，要按设备时区折算后再展示（详见 app/utils/datetime.ts）
const formatDateTime = (val: string) => formatLocalDateTime(val);

const pnlClass = (value: number) => (value >= 0 ? styles.up : styles.down);

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

    const transactionRecords = [...openTrades, ...closedTrades]
        .flatMap((trade: any) => {
            const soldRecords = (trade.sell_records || []).map((record: any) => ({
                id: `sell-${record.id}`,
                buyTime: trade.buy_time,
                buyPrice: trade.current_price,
                quantity: record.sell_quantity,
                sellTime: record.sell_time,
                sellPrice: record.sell_price,
                profit: (record.sell_price - trade.current_price) * record.sell_quantity,
            }));
            if (trade.remaining <= 0) return soldRecords;
            return [
                ...soldRecords,
                {
                    id: `open-${trade.id}`,
                    buyTime: trade.buy_time,
                    buyPrice: trade.current_price,
                    quantity: trade.remaining,
                    sellTime: null,
                    sellPrice: null,
                    profit: null,
                },
            ];
        })
        .sort((a: any, b: any) => b.buyTime.localeCompare(a.buyTime) || b.id.localeCompare(a.id));

    return (
        <div className={styles.page}>
            {/* 入口只有首页的持仓卡片，直接回首页，冷启动落在这个页面时也有确定的去处 */}
            <NavBar onBack={() => navigate("/", { replace: true })} className={styles.navBar}>
                {holding.item_name}
            </NavBar>

            <div className={styles.content}>
                {/* 汇总卡 */}
                <div className={styles.summaryCard}>
                    <div className={styles.summaryHeader}>
                        <span className={styles.itemName}>{holding.item_name}</span>
                        {holding.remaining_qty > 0 && (
                            <div onClick={() => setSellHolding(holding)} className={styles.sellEntry}>
                                记录卖出
                            </div>
                        )}
                    </div>
                    <div className={styles.summaryStats}>
                        <div>
                            <div className={styles.statLabel}>剩余持仓</div>
                            <div className={styles.statValue}>{holding.remaining_qty}</div>
                        </div>
                        <div>
                            <div className={styles.statLabel}>加权均价</div>
                            <div className={styles.statValue}>{formatPrice(holding.weighted_avg_price)}</div>
                        </div>
                        <div>
                            <div className={styles.statLabel}>累计盈亏</div>
                            <div className={clsx(styles.statValue, pnlClass(holding.realized_pnl))}>
                                {holding.realized_pnl >= 0 ? '+' : ''}{holding.realized_pnl.toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.sectionTitle}>交易记录（{transactionRecords.length}）</div>
                {transactionRecords.length === 0 ? (
                    <div className={styles.emptyRecords}>暂无交易记录</div>
                ) : (
                    transactionRecords.map((record: any) => {
                        const profitPct = record.sellPrice != null && record.buyPrice > 0
                            ? ((record.sellPrice - record.buyPrice) / record.buyPrice) * 100
                            : null;
                        return (
                            <div key={record.id} className={styles.transactionCard}>
                                <div className={styles.transactionHeader}>
                                    <span className={styles.transactionQuantity}>仓位 {record.quantity}</span>
                                    <span className={clsx(styles.pill, record.sellTime ? styles.pillClosed : styles.pillOpen)}>
                                        {record.sellTime ? '已卖出' : '持仓中'}
                                    </span>
                                </div>
                                <div className={styles.transactionGrid}>
                                    <div className={styles.transactionSide}>
                                        <span className={styles.transactionLabel}>买入</span>
                                        <span className={styles.transactionTime}>{formatDateTime(record.buyTime)}</span>
                                        <strong className={styles.transactionPrice}>{formatPrice(record.buyPrice)}</strong>
                                    </div>
                                    <div className={styles.transactionSide}>
                                        <span className={styles.transactionLabel}>卖出</span>
                                        <span className={styles.transactionTime}>
                                            {record.sellTime ? formatDateTime(record.sellTime) : '-'}
                                        </span>
                                        <strong className={styles.transactionPrice}>
                                            {record.sellPrice == null ? '-' : formatPrice(record.sellPrice)}
                                        </strong>
                                    </div>
                                </div>
                                <div className={clsx(styles.transactionProfit, record.profit == null ? undefined : pnlClass(record.profit))}>
                                    收益 {record.profit == null ? '-' : `${record.profit >= 0 ? '+' : ''}${record.profit.toFixed(2)} (${record.profit >= 0 ? '+' : ''}${profitPct!.toFixed(2)}%)`}
                                </div>
                            </div>
                        );
                    })
                )}
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

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

    // 渲染单张交易卡片
    const renderTradeCard = (t: any) => {
        const isClosed = t.sold_quantity >= t.buy_quantity;
        const isPartial = t.sold_quantity > 0 && !isClosed;
        const statusClass = isClosed ? styles.pillClosed : isPartial ? styles.pillPartial : styles.pillOpen;

        return (
            <div key={t.id} onClick={() => navigate(`/trade/${t.id}`)} className={styles.tradeCard}>
                <div className={styles.tradeHeader}>
                    <div className={styles.buyTime}>买入时间 {formatDateTime(t.buy_time)}</div>
                    <div className={clsx(styles.pill, statusClass)}>
                        {isClosed ? '已平仓' : isPartial ? '部分平仓' : '未平仓'}
                    </div>
                </div>

                <div className={styles.tradeGrid}>
                    <div className={styles.gridCell}>
                        <div className={styles.gridLabel}>买入价格</div>
                        <div className={styles.gridValue}>{formatPrice(t.current_price)}</div>
                    </div>
                    <div className={styles.gridCell}>
                        <div className={styles.gridLabel}>买入仓位</div>
                        <div className={styles.gridValue}>{t.buy_quantity}</div>
                    </div>
                    {!isClosed && t.sold_quantity > 0 && (
                        <div className={styles.remainingRow}>剩余仓位 {t.remaining}</div>
                    )}
                </div>

                {t.sell_records.length > 0 && (
                    <div className={styles.sellRecords}>
                        <div className={styles.sellRecordsTitle}>卖出记录（{t.sell_records.length}）</div>
                        {t.sell_records.map((r: any) => {
                            const pnl = (r.sell_price - t.current_price) * r.sell_quantity;
                            return (
                                <div key={r.id} className={styles.sellRecordRow}>
                                    <div className={styles.sellRecordMeta}>
                                        {formatDateTime(r.sell_time)} · 仓位 {r.sell_quantity}
                                    </div>
                                    <div className={clsx(styles.sellRecordPnl, pnlClass(pnl))}>
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

                <div className={styles.sectionTitle}>未平仓（{openTrades.length}）</div>
                {openTrades.map(renderTradeCard)}

                <div className={clsx(styles.sectionTitle, styles.sectionTitleSpaced)}>
                    已平仓（{closedTrades.length}）
                </div>
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

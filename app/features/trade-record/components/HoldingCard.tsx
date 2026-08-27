import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import styles from './HoldingCard.module.less';

const formatPrice = (val: number) => val.toFixed(2);
// 缩短时间格式，仅显示 MM-DD HH:mm，适合列表展示
const formatShortTime = (timeStr: string) => (timeStr ? timeStr.slice(5, 16) : '--');

// 涨跌统一走同一个判断，避免各处重复写三元
const pnlClass = (value: number) => (value >= 0 ? styles.up : styles.down);

export function HoldingCard({ holding }: { holding: any }) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <div className={styles.titleGroup}>
                    <span className={styles.itemName}>{holding.item_name}</span>
                    <span className={styles.itemMeta}>
                        {holding.trade_count}笔持仓 (余 {holding.remaining_qty} 仓)
                    </span>
                </div>
                {holding.live_price && (
                    <div className={styles.livePrice}>
                        现价: <span className={styles.livePriceValue}>{formatPrice(holding.live_price)}</span>
                    </div>
                )}
            </div>

            <div className={styles.summary}>
                <div className={styles.summaryCell}>
                    <span className={styles.summaryLabel}>最近平仓价</span>
                    {holding.last_sell_price != null ? (
                        <span className={clsx(styles.summaryValue, styles.weightNormal)}>
                            {formatPrice(holding.last_sell_price)}
                        </span>
                    ) : (
                        <span className={clsx(styles.summaryValue, styles.summaryEmpty)}>--</span>
                    )}
                </div>
                <div className={clsx(styles.summaryCell, styles.alignCenter)}>
                    <span className={styles.summaryLabel}>加权均价</span>
                    <span className={clsx(styles.summaryValue, styles.weightNormal)}>
                        {formatPrice(holding.weighted_avg_price)}
                    </span>
                </div>
                <div className={clsx(styles.summaryCell, styles.alignEnd)}>
                    <span className={styles.summaryLabel}>累计平仓盈亏</span>
                    <span className={clsx(styles.summaryValue, pnlClass(holding.realized_pnl))}>
                        {holding.realized_pnl >= 0 ? '+' : ''}
                        {holding.realized_pnl.toFixed(2)}
                    </span>
                </div>
            </div>

            {/* 底部栏：仅保留靠右的展开/收起箭头 */}
            {holding.sub_trades.length > 0 && (
                <div className={styles.toggleRow}>
                    <div
                        className={styles.toggleButton}
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(!expanded);
                        }}
                    >
                        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                </div>
            )}

            {expanded && holding.sub_trades.length > 0 && (
                <div className={styles.subTradeList}>
                    {holding.sub_trades.map((st: any) => {
                        const upside =
                            st.current_price > 0 ? ((st.target_price - st.current_price) / st.current_price) * 100 : 0;
                        const downside =
                            st.current_price > 0 ? ((st.current_price - st.stop_loss_price) / st.current_price) * 100 : 0;

                        const hasLive = holding.live_price != null;
                        const livePnlAmount = hasLive ? (holding.live_price - st.current_price) * st.remaining : 0;
                        // 单仓/单股价差
                        const livePnlPerShare = hasLive ? holding.live_price - st.current_price : 0;

                        return (
                            <div key={st.id} className={styles.subTrade}>
                                <div className={styles.subTradeLeft}>
                                    <span className={styles.buyTime}>{formatShortTime(st.buy_time)}</span>
                                    <span className={styles.buyPrice}>
                                        <span className={styles.inlineLabel}>入: </span>
                                        {formatPrice(st.current_price)}
                                    </span>
                                    <span className={styles.buyQty}>
                                        <span className={styles.inlineLabel}>仓: </span>
                                        {Math.floor(st.remaining)}
                                    </span>
                                </div>

                                <div className={styles.subTradeRight}>
                                    {/* 1. 预期列 */}
                                    <div className={styles.metricCol}>
                                        <span className={styles.metricLabel}>预期</span>
                                        <span className={styles.metricValue}>{formatPrice(st.target_price)}</span>
                                        <span className={clsx(styles.metricPct, pnlClass(upside))}>
                                            {upside >= 0 ? '+' : ''}
                                            {upside.toFixed(1)}%
                                        </span>
                                    </div>

                                    {/* 2. 止损列（放在当前盈亏之前，读起来更连贯） */}
                                    <div className={styles.metricCol}>
                                        <span className={styles.metricLabel}>止损</span>
                                        <span className={styles.metricValue}>{formatPrice(st.stop_loss_price)}</span>
                                        <span className={clsx(styles.metricPct, styles.down)}>
                                            {-downside.toFixed(1)}%
                                        </span>
                                    </div>

                                    {/* 3. 当前浮动收益列（靠数字字号和语义色区分，不再加底色） */}
                                    <div className={styles.pnlCol}>
                                        <span className={styles.metricLabel}>当前盈亏</span>
                                        {hasLive ? (
                                            <>
                                                <span className={clsx(styles.pnlAmount, pnlClass(livePnlAmount))}>
                                                    {livePnlAmount >= 0 ? '+' : ''}
                                                    {livePnlAmount.toFixed(0)}
                                                </span>
                                                <span className={styles.pnlPerShare}>
                                                    单仓 {livePnlPerShare >= 0 ? '+' : ''}
                                                    {livePnlPerShare.toFixed(2)}
                                                </span>
                                            </>
                                        ) : (
                                            <span className={styles.pnlEmpty}>--</span>
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

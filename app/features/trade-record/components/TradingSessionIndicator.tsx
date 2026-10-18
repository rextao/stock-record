import { useState, type MouseEvent } from 'react';
import { Popup } from 'antd-mobile';
import { ChevronRight, Clock3, X } from 'lucide-react';
import clsx from 'clsx';
import { useSharedNow } from '../../../common/hooks/useSharedNow';
import { getMarketSession } from '../../../utils/marketSession';
import styles from './TradingSessionIndicator.module.less';

export function TradingSessionIndicator() {
    const [visible, setVisible] = useState(false);
    const now = useSharedNow();
    const market = getMarketSession(new Date(now));

    const openPopup = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        setVisible(true);
    };

    return (
        <>
            <button
                type="button"
                className={styles.indicator}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={openPopup}
                aria-label={`当前交易时段：${market.label}，北京时间 ${market.beijingTime}，点击查看时段`}
            >
                <Clock3 size={13} aria-hidden />
                <span className={styles.indicatorLabel}>当前交易时段</span>
                <span className={clsx(styles.indicatorValue, market.id === 'closed' && styles.closed)}>
                    {market.label}
                </span>
                <span className={styles.beijingTime}>北京时间 {market.beijingTime}</span>
                <ChevronRight size={14} aria-hidden />
            </button>

            <Popup
                visible={visible}
                position="bottom"
                onMaskClick={() => setVisible(false)}
                bodyClassName={styles.popupBody}
            >
                <div className={styles.popupContent}>
                    <div className={styles.popupHeader}>
                        <div>
                            <div className={styles.popupTitle}>美股交易时段</div>
                            <div className={styles.popupSubtitle}>
                                北京时间 · {market.beijingTime} · {market.label}
                            </div>
                        </div>
                        <button
                            type="button"
                            className={styles.closeButton}
                            onClick={() => setVisible(false)}
                            aria-label="关闭交易时段说明"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className={styles.scheduleList}>
                        {market.schedule.map((session) => (
                            <div
                                key={session.id}
                                className={clsx(
                                    styles.scheduleRow,
                                    session.id === market.id && styles.currentSession,
                                )}
                            >
                                <span className={styles.sessionDot} aria-hidden />
                                <span className={styles.sessionName}>{session.label}</span>
                                <span className={styles.sessionTime}>{session.time}</span>
                                {session.id === market.id && <span className={styles.currentTag}>当前</span>}
                            </div>
                        ))}
                    </div>

                    {market.id === 'closed' && <div className={styles.closedHint}>当前为周末休市，夜盘将在开市后恢复。</div>}
                    <div className={styles.popupHint}>
                        {market.isDaylightSaving ? '当前为美股夏令时' : '当前为美股冬令时'}，时段会随夏令时自动切换。
                    </div>
                </div>
            </Popup>
        </>
    );
}

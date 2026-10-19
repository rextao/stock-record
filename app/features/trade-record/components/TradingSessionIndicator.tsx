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
                aria-label={`当前交易时段：${market.label}，点击查看时段时间轴`}
            >
                <Clock3 size={13} aria-hidden />
                <span className={styles.indicatorLabel}>当前交易时段</span>
                <span className={clsx(styles.indicatorValue, market.id === 'closed' && styles.closed)}>
                    {market.label}
                </span>
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
                            <div className={styles.popupSubtitle}>{market.label}</div>
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

                    <div className={styles.timeline}>
                        <div className={styles.timelineLabels}>
                            {market.schedule.map((session, index) => (
                                <span
                                    key={session.id}
                                    className={clsx(
                                        styles.timelineLabel,
                                        styles[`sessionLabel${index}`],
                                        session.id === market.id && styles.currentTimelineLabel,
                                    )}
                                >
                                    {session.label}
                                </span>
                            ))}
                        </div>
                        <div className={styles.timelineTrack}>
                            <span className={styles.timelineLine} aria-hidden />
                            <span
                                className={clsx(
                                    styles.currentMarker,
                                    styles[`markerPosition${Math.round(getTimelinePosition(market.beijingTime, market.isDaylightSaving))}`],
                                )}
                                aria-label={`当前时间位于${market.label}`}
                            />
                            {getTimelinePoints(market.isDaylightSaving).map((point) => (
                                <span
                                    key={point.time}
                                    className={clsx(styles.timelinePoint, styles[`pointPosition${point.position}`])}
                                >
                                    <span className={styles.timelineTick} aria-hidden />
                                    <span className={styles.timelineTime}>{point.time}</span>
                                </span>
                            ))}
                        </div>
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

type TimelinePoint = { time: string; position: number };

function getTimelinePoints(isDaylightSaving: boolean): TimelinePoint[] {
    const times = isDaylightSaving ? ['16:00', '21:30', '04:00', '08:00', '16:00'] : ['17:00', '22:30', '05:00', '09:00', '17:00'];
    return times.map((time, index) => ({ time, position: [0, 23, 50, 67, 100][index] }));
}

function getTimelinePosition(beijingTime: string, isDaylightSaving: boolean): number {
    const [hour, minute] = beijingTime.split(':').map(Number);
    const current = hour * 60 + minute;
    const start = isDaylightSaving ? 16 * 60 : 17 * 60;
    const elapsed = (current - start + 24 * 60) % (24 * 60);
    return (elapsed / (24 * 60)) * 100;
}

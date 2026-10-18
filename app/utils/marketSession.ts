/**
 * 美股交易时段，统一按美东时间判断、按北京时间展示。
 *
 * 这里不依赖设备时区：用户在海外打开 App 时，卡片仍然显示同一套北京时间。
 * 周末不落入夜盘，直接显示休市；交易所节假日不在本地日历内，仍按周一至周五的
 * 常规时段计算。
 */

export type MarketSessionId = 'pre' | 'regular' | 'after' | 'overnight' | 'closed';

export interface MarketSessionSchedule {
    id: Exclude<MarketSessionId, 'closed'>;
    label: string;
    time: string;
}

export interface MarketSessionState {
    id: MarketSessionId;
    label: string;
    beijingTime: string;
    schedule: MarketSessionSchedule[];
    isDaylightSaving: boolean;
}

const BEIJING_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

const EASTERN_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

const EASTERN_ZONE_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
});

const SESSION_LABELS: Record<Exclude<MarketSessionId, 'closed'>, string> = {
    pre: '盘前交易',
    regular: '常规交易',
    after: '盘后交易',
    overnight: '夜盘',
};

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
    return parts.find((part) => part.type === type)?.value ?? '';
}

function isDaylightSavingTime(date: Date): boolean {
    // en-US 的短时区名在美东返回 EDT/EST；用它而不是设备时区的 offset，避免用户在海外时判断错误。
    return EASTERN_ZONE_FORMATTER.format(date).endsWith('EDT');
}

function getSessionId(date: Date): MarketSessionId {
    const parts = EASTERN_PARTS_FORMATTER.formatToParts(date);
    const weekday = getPart(parts, 'weekday');
    const hour = Number(getPart(parts, 'hour'));
    const minute = Number(getPart(parts, 'minute'));
    const totalMinutes = hour * 60 + minute;

    // 美股夜盘从周日 20:00 ET 开始，到周五 20:00 ET 结束；周末其余时间休市。
    if (weekday === 'Sat' || (weekday === 'Sun' && totalMinutes < 20 * 60)) return 'closed';
    if (weekday === 'Fri' && totalMinutes >= 20 * 60) return 'closed';

    if (totalMinutes < 4 * 60) return 'overnight';
    if (totalMinutes < 9 * 60 + 30) return 'pre';
    if (totalMinutes < 16 * 60) return 'regular';
    if (totalMinutes < 20 * 60) return 'after';
    return 'overnight';
}

function getSchedule(isDaylightSaving: boolean): MarketSessionSchedule[] {
    return [
        {
            id: 'pre',
            label: SESSION_LABELS.pre,
            time: isDaylightSaving ? '16:00–21:30' : '17:00–22:30',
        },
        {
            id: 'regular',
            label: SESSION_LABELS.regular,
            time: isDaylightSaving ? '21:30–04:00' : '22:30–05:00',
        },
        {
            id: 'after',
            label: SESSION_LABELS.after,
            time: isDaylightSaving ? '04:00–08:00' : '05:00–09:00',
        },
        {
            id: 'overnight',
            label: SESSION_LABELS.overnight,
            time: isDaylightSaving ? '08:00–16:00' : '09:00–17:00',
        },
    ];
}

export function getMarketSession(date: Date = new Date()): MarketSessionState {
    const isDaylightSaving = isDaylightSavingTime(date);
    const id = getSessionId(date);
    const schedule = getSchedule(isDaylightSaving);
    const current = schedule.find((item) => item.id === id);

    return {
        id,
        label: current?.label ?? '休市',
        beijingTime: BEIJING_TIME_FORMATTER.format(date),
        schedule,
        isDaylightSaving,
    };
}

export type ChartRangeKey =
  | 'all'
  | 'year'
  | 'month'
  | 'lastMonth'
  | 'week'
  | 'lastWeek'
  | 'custom'

export const CHART_RANGE_OPTIONS: { key: ChartRangeKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'year', label: '本年' },
  { key: 'month', label: '本月' },
  { key: 'lastMonth', label: '上月' },
  { key: 'week', label: '本周' },
  { key: 'lastWeek', label: '上周' },
  { key: 'custom', label: '日期选择' },
]

export const CHART_ALL_START = '2026-01-01'

const pad = (n: number) => n.toString().padStart(2, '0')

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayDate(): string {
  return formatDate(new Date())
}

export function formatRangeChip(start: string, end: string): string {
  const toDot = (s: string) => s.replace(/-/g, '.')
  if (start.slice(0, 4) === end.slice(0, 4)) {
    return `${toDot(start)}-${toDot(end).slice(5)}`
  }
  return `${toDot(start)}-${toDot(end)}`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
}

/** 周一为一周开始 */
function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff))
}

function lastDayOfMonth(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex + 1, 0, 23, 59, 59)
}

export function getChartRangeBounds(
  key: ChartRangeKey,
  customStart?: string,
  customEnd?: string
): { start: string; end: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  if (key === 'all') {
    return { start: `${CHART_ALL_START} 00:00:00`, end: `${todayDate()} 23:59:59` }
  }
  if (key === 'year') {
    return {
      start: `${y}-01-01 00:00:00`,
      end: `${y}-12-31 23:59:59`,
    }
  }
  if (key === 'month') {
    return {
      start: `${y}-${pad(m + 1)}-01 00:00:00`,
      end: formatDate(lastDayOfMonth(y, m)) + ' 23:59:59',
    }
  }
  if (key === 'lastMonth') {
    const lm = m === 0 ? 11 : m - 1
    const ly = m === 0 ? y - 1 : y
    return {
      start: `${ly}-${pad(lm + 1)}-01 00:00:00`,
      end: formatDate(lastDayOfMonth(ly, lm)) + ' 23:59:59',
    }
  }
  if (key === 'week') {
    const start = startOfWeek(now)
    const end = endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6))
    return { start: `${formatDate(start)} 00:00:00`, end: `${formatDate(end)} 23:59:59` }
  }
  if (key === 'lastWeek') {
    const thisWeek = startOfWeek(now)
    const start = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - 7)
    const end = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - 1, 23, 59, 59)
    return { start: `${formatDate(start)} 00:00:00`, end: `${formatDate(end)} 23:59:59` }
  }
  const start = customStart || CHART_ALL_START
  const end = customEnd || todayDate()
  return { start: `${start} 00:00:00`, end: `${end} 23:59:59` }
}

export function isTimeInRange(timeStr: string | null | undefined, start: string, end: string): boolean {
  if (!timeStr) return false
  return timeStr >= start && timeStr <= end
}

export function enumerateDays(startYmd: string, endYmd: string): string[] {
  const start = startYmd.slice(0, 10)
  let end = endYmd.slice(0, 10)
  const today = todayDate()
  if (end > today) end = today
  if (start > end) return [start]
  const days: string[] = []
  const [sy, sm, sd] = start.split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const [ey, em, ed] = end.split('-').map(Number)
  const last = new Date(ey, em - 1, ed)
  while (cur <= last) {
    days.push(formatDate(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

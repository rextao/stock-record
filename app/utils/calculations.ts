export function calcUpsidePct(currentPrice: number, targetPrice: number): number {
  if (currentPrice === 0) return 0
  return ((targetPrice - currentPrice) / currentPrice) * 100
}

export function calcDownsidePct(currentPrice: number, stopLossPrice: number): number {
  if (currentPrice === 0) return 0
  return ((currentPrice - stopLossPrice) / currentPrice) * 100
}

export function calcActualReturnPct(
  currentPrice: number,
  actualPrice: number | null
): number | null {
  if (actualPrice === null || currentPrice === 0) return null
  return ((actualPrice - currentPrice) / currentPrice) * 100
}

export interface PriceChange {
  /** 绝对差值 to - from */
  diff: number
  /** 相对 from 的涨跌幅，百分比 */
  pct: number
  /** 倍数 to / from */
  ratio: number
}

/** 两个价格之间的变化。from 为 0 或输入非法时无意义，返回 null 交给调用方展示占位 */
export function calcPriceChange(from: number, to: number): PriceChange | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null
  const diff = to - from
  return { diff, pct: (diff / from) * 100, ratio: to / from }
}

export function formatPct(value: number | null): string {
  if (value === null) return '--'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatPrice(value: number): string {
  return value.toFixed(2)
}

export function formatSignedAmount(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
}

/** 盈亏比：预期盈利 / 预期亏损，亏损归一为 1，如 1.33：1 */
export function formatRewardRisk(expectedProfit: number, expectedLoss: number): string {
  if (expectedLoss <= 0) {
    if (expectedProfit <= 0) return '--'
    return '∞：1'
  }
  return `${(expectedProfit / expectedLoss).toFixed(2)}：1`
}

export interface SellLotPreview {
  tradeId: number
  buyTime: string
  buyPrice: number
  quantity: number
  profit: number
}

/** 与 recordSellByItem 相同：按买入时间从新到旧扣减仓位 */
export function previewSellLots(
  lots: { id: number; buy_time: string; current_price: number; remaining: number }[],
  sellQty: number,
  sellPrice: number
): { lots: SellLotPreview[]; totalProfit: number } {
  const ordered = [...lots].sort((a, b) => b.buy_time.localeCompare(a.buy_time))
  let remaining = sellQty
  const result: SellLotPreview[] = []
  for (const t of ordered) {
    if (remaining <= 0) break
    const take = Math.min(t.remaining, remaining)
    if (take <= 0) continue
    result.push({
      tradeId: t.id,
      buyTime: t.buy_time,
      buyPrice: t.current_price,
      quantity: take,
      profit: (sellPrice - t.current_price) * take,
    })
    remaining -= take
  }
  return {
    lots: result,
    totalProfit: result.reduce((sum, lot) => sum + lot.profit, 0),
  }
}

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

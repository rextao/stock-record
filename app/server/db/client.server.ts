import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { Item, Trade, SellRecord, TradeWithItem, HoldingCard, HoldingSubTrade } from '../../features/trade-record/types';

// 你可以把这些纯计算函数放到 app/common/utils/calculations.ts 中
// 这里为了示例完整性暂时保留简单的 mock
const calcUpsidePct = (curr: number, target: number) => ((target - curr) / curr) * 100;
const calcDownsidePct = (curr: number, stop: number) => ((curr - stop) / curr) * 100;

export class TradingDB {
    constructor(private db: D1Database) {}

    private nowLocalTime(): string {
        const d = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    private enrichTrade(trade: Trade, itemName: string): TradeWithItem {
        const totalSoldPct =
            trade.actual_price !== null && trade.current_price
                ? ((trade.actual_price - trade.current_price) / trade.current_price) * 100
                : null;
        return {
            ...trade,
            item_name: itemName,
            upside_pct: calcUpsidePct(trade.current_price, trade.target_price),
            downside_pct: calcDownsidePct(trade.current_price, trade.stop_loss_price),
            actual_return_pct: totalSoldPct,
            is_fully_closed: trade.sold_quantity >= trade.buy_quantity,
            total_profit: null,
        };
    }

    private calcProfit(records: SellRecord[] | undefined, buyPrice: number): number {
        if (!records) return 0;
        return records.reduce((sum, r) => sum + (r.sell_price - buyPrice) * r.sell_quantity, 0);
    }

    // ============== Items ==============
    async getAllItems(): Promise<Item[]> {
        const { results } = await this.db.prepare('SELECT * FROM items ORDER BY created_at DESC').all<Item>();
        return results;
    }

    async createItem(data: { name: string; symbol?: string; description?: string; exchange?: string }): Promise<number> {
        const createdAt = this.nowLocalTime();
        const { results } = await this.db
            .prepare(`INSERT INTO items (name, symbol, description, exchange, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id`)
            .bind(data.name, data.symbol || null, data.description || null, data.exchange || null, createdAt)
            .all<{ id: number }>();
        return results[0].id;
    }

    // ============== Trades ==============
    async createTrade(data: { item_id: number; current_price: number; target_price: number; stop_loss_price: number; buy_quantity: number; notes?: string }): Promise<number> {
        const now = this.nowLocalTime();
        const { results } = await this.db
            .prepare(
                `INSERT INTO trades (item_id, current_price, target_price, stop_loss_price, buy_quantity, notes, buy_time, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
            )
            .bind(data.item_id, data.current_price, data.target_price, data.stop_loss_price, data.buy_quantity, data.notes || null, now, now)
            .all<{ id: number }>();
        return results[0].id;
    }

    async recordSell(tradeId: number, actualPrice: number, sellQuantity: number): Promise<void> {
        const now = this.nowLocalTime();
        const stmts = [
            this.db.prepare(`INSERT INTO sell_records (trade_id, sell_price, sell_quantity, sell_time) VALUES (?, ?, ?, ?)`).bind(tradeId, actualPrice, sellQuantity, now),
            this.db.prepare(`UPDATE trades SET actual_price = ?, sold_quantity = sold_quantity + ?, sell_time = ? WHERE id = ?`).bind(actualPrice, sellQuantity, now, tradeId)
        ];
        await this.db.batch(stmts);
    }

    // ============== 聚合查询 ==============
    async getOpenHoldings(): Promise<HoldingCard[]> {
        const { results: openTrades } = await this.db
            .prepare(`SELECT t.*, i.name as item_name FROM trades t LEFT JOIN items i ON t.item_id = i.id WHERE t.sold_quantity < t.buy_quantity`)
            .all<Trade & { item_name: string }>();

        if (openTrades.length === 0) return [];

        const tradeIds = openTrades.map(t => t.id);
        const placeholders = tradeIds.map(() => '?').join(',');

        let allRecords: SellRecord[] = [];
        if (tradeIds.length > 0) {
            const { results } = await this.db
                .prepare(`SELECT * FROM sell_records WHERE trade_id IN (${placeholders}) ORDER BY sell_time ASC`)
                .bind(...tradeIds)
                .all<SellRecord>();
            allRecords = results;
        }

        const recordsMap = new Map<number, SellRecord[]>();
        for (const r of allRecords) {
            if (!recordsMap.has(r.trade_id)) recordsMap.set(r.trade_id, []);
            recordsMap.get(r.trade_id)!.push(r);
        }

        const grouped = new Map<number, (Trade & { item_name: string })[]>();
        for (const t of openTrades) {
            if (!grouped.has(t.item_id)) grouped.set(t.item_id, []);
            grouped.get(t.item_id)!.push(t);
        }

        const result: HoldingCard[] = [];
        for (const [itemId, itemTrades] of grouped) {
            let remainingQty = 0;
            let weightedSum = 0;
            let realizedPnl = 0;

            for (const t of itemTrades) {
                const rem = t.buy_quantity - t.sold_quantity;
                remainingQty += rem;
                weightedSum += t.current_price * rem;
                realizedPnl += this.calcProfit(recordsMap.get(t.id), t.current_price);
            }

            const subTrades: HoldingSubTrade[] = itemTrades
                .sort((a, b) => b.buy_time.localeCompare(a.buy_time))
                .map((t) => ({
                    id: t.id,
                    buy_time: t.buy_time,
                    current_price: t.current_price,
                    target_price: t.target_price,
                    stop_loss_price: t.stop_loss_price,
                    buy_quantity: t.buy_quantity,
                    sold_quantity: t.sold_quantity,
                    remaining: t.buy_quantity - t.sold_quantity,
                }));

            result.push({
                item_id: itemId,
                item_name: itemTrades[0].item_name || '',
                remaining_qty: remainingQty,
                weighted_avg_price: remainingQty > 0 ? weightedSum / remainingQty : 0,
                realized_pnl: realizedPnl,
                trade_count: itemTrades.length,
                sub_trades: subTrades,
            });
        }
        return result;
    }
}

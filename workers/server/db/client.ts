import type {
    Item,
    Trade,
    SellRecord,
    TradeWithItem,
    HoldingCard,
    HoldingSubTrade,
    HoldingDetailPayload,
    HoldingTradeDetail,
    TradeDetail,
} from '../../../app/features/trade-record/types';

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

    // ==========================================
    // 条目管理 (Items)
    // ==========================================

    // 1. 新增条目 (带重复校验)
    async createItem(item: { name: string; symbol: string; description: string; exchange: string }): Promise<void> {
        // 校验是否已经存在相同 symbol 的股票
        const existing = await this.db.prepare('SELECT id FROM items WHERE symbol = ?').bind(item.symbol).first();
        if (existing) {
            throw new Error(`标的 ${item.symbol} 已存在，请勿重复添加`);
        }

        await this.db.prepare(
            'INSERT INTO items (name, symbol, description, exchange, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(item.name, item.symbol, item.description, item.exchange, this.nowLocalTime()).run();
    }

    // 2. 删除条目 (级联删除关联的 trades 和 sell_records)
    async deleteItem(id: number): Promise<void> {
        // 查找该条目下的所有交易记录 ID
        const tradesRows = await this.db.prepare('SELECT id FROM trades WHERE item_id = ?').bind(id).all();
        const tradeIds = tradesRows.results.map((t: any) => t.id);

        const stmts = [];

        // 如果有交易记录，先删除它们的卖出记录
        if (tradeIds.length > 0) {
            const placeholders = tradeIds.map(() => '?').join(',');
            stmts.push(
                this.db.prepare(`DELETE FROM sell_records WHERE trade_id IN (${placeholders})`).bind(...tradeIds)
            );
        }

        // 删除该条目下的交易记录
        stmts.push(this.db.prepare('DELETE FROM trades WHERE item_id = ?').bind(id));

        // 最后删除条目本身
        stmts.push(this.db.prepare('DELETE FROM items WHERE id = ?').bind(id));

        // 使用批量事务，保证数据一致性
        await this.db.batch(stmts);
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
    // ==========================================
    // 获取所有交易（附带标的名称和卖出记录）- 用于图表统计
    // ==========================================
    async getAllTrades(): Promise<TradeWithItem[]> {
        // 1. 联合查询获取所有 trades 及其对应的 item_name
        const { results: tradesRows } = await this.db.prepare(`
        SELECT t.*, i.name as item_name 
        FROM trades t 
        LEFT JOIN items i ON t.item_id = i.id 
        ORDER BY t.buy_time DESC
    `).all<Trade & { item_name: string }>();

        // 2. 获取所有的卖出记录
        const { results: allRecords } = await this.db.prepare(
            'SELECT * FROM sell_records ORDER BY sell_time ASC'
        ).all<SellRecord>();

        // 3. 将卖出记录按 trade_id 分组进行内存聚合
        const recordsMap = new Map<number, SellRecord[]>();
        for (const r of allRecords) {
            if (!recordsMap.has(r.trade_id)) {
                recordsMap.set(r.trade_id, []);
            }
            recordsMap.get(r.trade_id)!.push(r);
        }

        // 4. 组装最终的数据结构
        return tradesRows.map((t) => {
            // 这里复用了类中已有的 enrichTrade 和 calcProfit 方法
            const enriched = this.enrichTrade(t, t.item_name || '');
            const recs = recordsMap.get(t.id) || [];

            enriched.sell_records = recs;
            if (recs.length > 0) {
                enriched.total_profit = this.calcProfit(recs, t.current_price);
            } else {
                enriched.total_profit = 0;
            }

            return enriched;
        });
    }
    // 按标的快捷卖出 (自动扣减未平仓记录)
    async recordSellByItem(itemId: number, price: number, qty: number): Promise<void> {
        if (!price || price <= 0) throw new Error('无效的卖出价格');
        if (!qty || qty <= 0) throw new Error('无效的卖出数量');

        // 1. 获取该标的下的所有未平仓交易 (按 buy_time DESC 排序，复刻你原有的逻辑)
        const { results: openTrades } = await this.db
            .prepare('SELECT * FROM trades WHERE item_id = ? AND sold_quantity < buy_quantity ORDER BY buy_time DESC')
            .bind(itemId)
            .all<Trade>();

        // 2. 校验总仓位是否足够
        const totalRemaining = openTrades.reduce((sum, t) => sum + (t.buy_quantity - t.sold_quantity), 0);
        if (totalRemaining < qty) {
            throw new Error(`卖出数量超过剩余持仓 ${totalRemaining}`);
        }

        let remaining = qty;
        const now = this.nowLocalTime();

        // 使用 any 绕过类型检查，或者如果你导出了 D1PreparedStatement 类型也可以加上
        const stmts: any[] = [];

        // 3. 循环扣减仓位并生成批处理 SQL
        for (const t of openTrades) {
            if (remaining <= 0) break;
            const available = t.buy_quantity - t.sold_quantity;
            const take = Math.min(available, remaining);

            // 添加卖出记录
            stmts.push(
                this.db.prepare(
                    `INSERT INTO sell_records (trade_id, sell_price, sell_quantity, sell_time) VALUES (?, ?, ?, ?)`
                ).bind(t.id, price, take, now)
            );

            // 更新原交易的已售数量和实际价格
            stmts.push(
                this.db.prepare(
                    `UPDATE trades SET actual_price = ?, sold_quantity = sold_quantity + ?, sell_time = ? WHERE id = ?`
                ).bind(price, take, now, t.id)
            );

            remaining -= take;
        }

        // 4. 开启 D1 事务批量执行，保证数据强一致性
        if (stmts.length > 0) {
            await this.db.batch(stmts);
        }
    }
    // ============== 聚合查询 ==============
    async getOpenHoldings(): Promise<HoldingCard[]> {
        const { results: openTrades } = await this.db
            .prepare(`SELECT t.*, i.name as item_name, i.symbol as item_symbol FROM trades t LEFT JOIN items i ON t.item_id = i.id WHERE t.sold_quantity < t.buy_quantity`)
            .all<Trade & { item_name: string; item_symbol: string }>();

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

        const grouped = new Map<number, (Trade & { item_name: string; item_symbol: string })[]>();
        for (const t of openTrades) {
            if (!grouped.has(t.item_id)) grouped.set(t.item_id, []);
            grouped.get(t.item_id)!.push(t);
        }

        // 最近一次卖出价：按标的取，而不是只看未平仓的那几笔 —— 最近的卖出很可能发生在一笔已经清完的仓上。
        // 批量卖出时同一标的多条记录共享 sell_time，所以再用 id 兜底排序。
        const itemIds = [...grouped.keys()];
        const lastSellMap = new Map<number, { price: number; time: string }>();
        if (itemIds.length > 0) {
            const itemPlaceholders = itemIds.map(() => '?').join(',');
            const { results: sells } = await this.db
                .prepare(
                    `SELECT t.item_id as item_id, sr.sell_price as sell_price, sr.sell_time as sell_time
                     FROM sell_records sr JOIN trades t ON sr.trade_id = t.id
                     WHERE t.item_id IN (${itemPlaceholders})
                     ORDER BY sr.sell_time ASC, sr.id ASC`
                )
                .bind(...itemIds)
                .all<{ item_id: number; sell_price: number; sell_time: string }>();
            // 升序遍历，后写覆盖前写，留下的就是最后一条
            for (const s of sells) {
                lastSellMap.set(s.item_id, { price: s.sell_price, time: s.sell_time });
            }
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
                item_symbol: itemTrades[0].item_symbol || '',
                remaining_qty: remainingQty,
                weighted_avg_price: remainingQty > 0 ? weightedSum / remainingQty : 0,
                realized_pnl: realizedPnl,
                last_sell_price: lastSellMap.get(itemId)?.price ?? null,
                last_sell_time: lastSellMap.get(itemId)?.time ?? null,
                trade_count: itemTrades.length,
                sub_trades: subTrades,
            });
        }
        return result;
    }

    // 删除单笔交易（连带它的卖出记录）
    async deleteTrade(id: number): Promise<void> {
        await this.db.batch([
            this.db.prepare('DELETE FROM sell_records WHERE trade_id = ?').bind(id),
            this.db.prepare('DELETE FROM trades WHERE id = ?').bind(id),
        ]);
    }

    // 某个标的的持仓详情：未平仓 / 已平仓两组交易 + 聚合信息
    async getHoldingDetail(itemId: number): Promise<HoldingDetailPayload> {
        const { results: trades } = await this.db
            .prepare(
                `SELECT t.*, i.name as item_name
                 FROM trades t LEFT JOIN items i ON t.item_id = i.id
                 WHERE t.item_id = ? ORDER BY t.buy_time DESC`
            )
            .bind(itemId)
            .all<Trade & { item_name: string }>();

        const { results: records } = await this.db
            .prepare(
                `SELECT r.* FROM sell_records r
                 JOIN trades t ON r.trade_id = t.id
                 WHERE t.item_id = ? ORDER BY r.sell_time ASC`
            )
            .bind(itemId)
            .all<SellRecord>();

        const recordsMap = new Map<number, SellRecord[]>();
        for (const r of records) {
            if (!recordsMap.has(r.trade_id)) recordsMap.set(r.trade_id, []);
            recordsMap.get(r.trade_id)!.push(r);
        }

        let remainingQty = 0;
        let weightedSum = 0;
        let realizedPnl = 0;
        const openTrades: HoldingTradeDetail[] = [];
        const closedTrades: HoldingTradeDetail[] = [];

        for (const t of trades) {
            const recs = recordsMap.get(t.id) || [];
            const profit = this.calcProfit(recs, t.current_price);
            realizedPnl += profit;

            if (t.sold_quantity < t.buy_quantity) {
                const rem = t.buy_quantity - t.sold_quantity;
                remainingQty += rem;
                weightedSum += t.current_price * rem;
                openTrades.push({ ...t, sell_records: recs, profit, remaining: rem });
            } else {
                closedTrades.push({ ...t, sell_records: recs, profit, remaining: 0 });
            }
        }

        return {
            holding: {
                item_id: itemId,
                item_name: trades[0]?.item_name || '未知标的',
                remaining_qty: remainingQty,
                weighted_avg_price: remainingQty > 0 ? weightedSum / remainingQty : 0,
                realized_pnl: realizedPnl,
                sub_trades: openTrades,
            },
            openTrades,
            closedTrades,
        };
    }

    // 单笔交易详情，附带派生的盈亏比例
    async getTradeDetail(tradeId: number): Promise<TradeDetail | null> {
        const trade = await this.db
            .prepare(
                `SELECT t.*, i.name as item_name FROM trades t
                 LEFT JOIN items i ON t.item_id = i.id WHERE t.id = ?`
            )
            .bind(tradeId)
            .first<Trade & { item_name: string }>();

        if (!trade) return null;

        const actualReturnPct =
            trade.actual_price !== null && trade.current_price
                ? ((trade.actual_price - trade.current_price) / trade.current_price) * 100
                : null;

        return {
            ...trade,
            upside_pct: calcUpsidePct(trade.current_price, trade.target_price),
            downside_pct: calcDownsidePct(trade.current_price, trade.stop_loss_price),
            actual_return_pct: actualReturnPct,
            is_fully_closed: trade.sold_quantity >= trade.buy_quantity,
            remaining: trade.buy_quantity - trade.sold_quantity,
        };
    }
}

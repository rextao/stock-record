// 交易记录领域模型：客户端组件与 Worker API 共用这一份类型定义

export interface Item {
	id: number;
	name: string;
	symbol: string | null;
	description: string | null;
	exchange: string | null;
	created_at: string;
}

export interface Trade {
	id: number;
	item_id: number;
	current_price: number;
	target_price: number;
	stop_loss_price: number;
	actual_price: number | null;
	buy_quantity: number;
	sold_quantity: number;
	notes: string | null;
	buy_time: string;
	sell_time: string | null;
	created_at: string;
}

export interface SellRecord {
	id: number;
	trade_id: number;
	sell_price: number;
	sell_quantity: number;
	sell_time: string;
}

export interface TradeWithItem extends Trade {
	item_name: string;
	upside_pct: number;
	downside_pct: number;
	actual_return_pct: number | null;
	is_fully_closed: boolean;
	total_profit: number | null;
	sell_records?: SellRecord[];
}

/** 单笔交易在持仓视图里的精简形态 */
export interface HoldingSubTrade {
	id: number;
	buy_time: string;
	current_price: number;
	target_price: number;
	stop_loss_price: number;
	buy_quantity: number;
	sold_quantity: number;
	remaining: number;
}

/** 按标的聚合后的持仓卡片 */
export interface HoldingCard {
	item_id: number;
	item_name: string;
	/** 标的代码，取行情用的是它，不是展示名 */
	item_symbol: string;
	remaining_qty: number;
	weighted_avg_price: number;
	realized_pnl: number;
	/** 该标的最近一次卖出价；从未卖过为 null */
	last_sell_price: number | null;
	/** 最近一次卖出时间，与 last_sell_price 同源 */
	last_sell_time: string | null;
	trade_count: number;
	sub_trades: HoldingSubTrade[];
}

/** 首页列表：持仓卡片 + 实时价 */
export interface HoldingCardWithPrice extends HoldingCard {
	live_price: number | null;
}

/** 持仓详情页里的单笔交易 */
export interface HoldingTradeDetail extends Trade {
	item_name: string;
	sell_records: SellRecord[];
	profit: number;
	remaining: number;
}

export interface HoldingDetailPayload {
	holding: {
		item_id: number;
		item_name: string;
		remaining_qty: number;
		weighted_avg_price: number;
		realized_pnl: number;
		sub_trades: HoldingTradeDetail[];
	};
	openTrades: HoldingTradeDetail[];
	closedTrades: HoldingTradeDetail[];
}

/** 单笔交易详情页的数据形态 */
export interface TradeDetail extends Trade {
	item_name: string;
	upside_pct: number;
	downside_pct: number;
	actual_return_pct: number | null;
	is_fully_closed: boolean;
	remaining: number;
}

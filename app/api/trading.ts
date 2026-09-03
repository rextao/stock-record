// 浏览器端唯一的数据出入口。所有页面通过它访问 Worker 上的 /api 接口，
// 页面组件里不再出现任何服务端代码。
import type {
	HoldingCardWithPrice,
	HoldingDetailPayload,
	ItemWithUsage,
	TradeDetail,
	TradeWithItem,
} from "../features/trade-record/types";
import type { HistoryRange, PriceHistory } from "../features/stock-chart/types";

export interface StockSearchResult {
	symbol: string;
	description: string;
	exchange: string;
	type?: string;
}

interface RequestOptions {
	signal?: AbortSignal;
}

/**
 * 带上 HTTP 状态和服务端给的机器可读原因。
 * 页面偶尔需要按原因分叉（例如上游限流时给重试按钮加冷却），只有中文文案不够用。
 */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly reason?: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(path, {
		credentials: "same-origin",
		...init,
		headers: { Accept: "application/json", ...(init.headers || {}) },
	});

	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		const body = payload as { error?: string; reason?: string } | null;
		throw new ApiError(
			body?.error || `请求失败（${response.status}）`,
			response.status,
			body?.reason,
		);
	}
	return payload as T;
}

function postJson<T>(path: string, body: unknown, options: RequestOptions = {}) {
	return request<T>(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: options.signal,
	});
}

function patchJson<T>(path: string, body: unknown, options: RequestOptions = {}) {
	return request<T>(path, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: options.signal,
	});
}

// ---------- 标的 ----------
export const fetchItems = (options: RequestOptions = {}) =>
	request<{ items: ItemWithUsage[] }>("/api/items", { signal: options.signal });

export const createItem = (
	payload: { name: string; symbol: string; description: string; exchange: string },
) => postJson<{ success: true }>("/api/items", payload);

/** 改条目的名称 / 代码 / 备注。代码传空串即清空（后端存 NULL，之后不再拉行情） */
export const updateItem = (
	id: number,
	payload: { name: string; symbol: string; description: string },
) => patchJson<{ success: true }>(`/api/items/${id}`, payload);

export const deleteItem = (id: number) =>
	request<{ success: true; deletedId: number }>(`/api/items/${id}`, { method: "DELETE" });

// ---------- 持仓 ----------
export const fetchHoldings = (options: RequestOptions = {}) =>
	request<{ holdings: HoldingCardWithPrice[] }>("/api/holdings", { signal: options.signal });

export const fetchHoldingDetail = (itemId: number, options: RequestOptions = {}) =>
	request<HoldingDetailPayload>(`/api/holdings/${itemId}`, { signal: options.signal });

export const sellByItem = (payload: { itemId: number; price: number; qty: number }) =>
	postJson<{ success: true }>("/api/holdings/sell", payload);

// ---------- 单标的报价 ----------
export interface QuotePayload {
	symbol: string;
	price: number;
	fetchedAt: number | null;
}

/**
 * 拉单个标的的现价。refresh=true 会让服务端先清掉两级缓存再打第三方，
 * 对应首页卡片上的手动刷新。取不到报价时服务端返回 502，这里统一抛错。
 */
export const fetchQuote = (symbol: string, options: RequestOptions & { refresh?: boolean } = {}) =>
	request<QuotePayload>(
		`/api/quotes/${encodeURIComponent(symbol)}${options.refresh ? "?refresh=1" : ""}`,
		{ signal: options.signal },
	);

// ---------- 历史日线 ----------
/**
 * 拉某个标的的日收盘价序列。数据源是 Yahoo（Finnhub 免费档没有历史权限），
 * 服务端缓存 1 小时，取不到时返回 502，这里统一抛错。
 *
 * refresh=true 对应走势页的刷新按钮：服务端会清掉两级缓存、跳过 D1 的新鲜短路直接打
 * 上游，SW 也不接管这条请求（否则 NetworkFirst 的 3 秒超时会回放旧曲线）。
 */
export const fetchPriceHistory = (
	symbol: string,
	range: HistoryRange,
	options: RequestOptions & { refresh?: boolean } = {},
) =>
	request<PriceHistory>(
		`/api/history/${encodeURIComponent(symbol)}?range=${range}${options.refresh ? "&refresh=1" : ""}`,
		{ signal: options.signal },
	);

// ---------- 交易 ----------
export const fetchTrades = (options: RequestOptions = {}) =>
	request<{ trades: TradeWithItem[] }>("/api/trades", { signal: options.signal });

export const fetchTradeDetail = (id: number, options: RequestOptions = {}) =>
	request<{ trade: TradeDetail }>(`/api/trades/${id}`, { signal: options.signal });

export const createTrade = (payload: {
	itemId: number;
	currentPrice: number;
	targetPrice: number;
	stopLossPrice: number;
	buyQuantity: number;
	notes?: string;
}) => postJson<{ id: number }>("/api/trades", payload);

export const sellTrade = (id: number, payload: { price: number; qty: number }) =>
	postJson<{ success: true }>(`/api/trades/${id}/sell`, payload);

export const deleteTrade = (id: number) =>
	request<{ deleted: true }>(`/api/trades/${id}`, { method: "DELETE" });

/** 改买入时刻。传完整的 `YYYY-MM-DD HH:mm:ss`，走势页改日期时会保留原时分秒 */
export const updateTradeBuyTime = (id: number, buyTime: string) =>
	patchJson<{ success: true }>(`/api/trades/${id}`, { buyTime });

/** 改某条卖出记录的成交时刻，格式同上 */
export const updateSellRecordTime = (id: number, sellTime: string) =>
	patchJson<{ success: true }>(`/api/sell-records/${id}`, { sellTime });

// ---------- 行情搜索 ----------
export const searchStocks = (q: string, options: RequestOptions = {}) =>
	request<{ results: StockSearchResult[]; error?: string }>(
		`/api/stocks/search?q=${encodeURIComponent(q)}`,
		{ signal: options.signal },
	);

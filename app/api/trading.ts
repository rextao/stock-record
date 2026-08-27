// 浏览器端唯一的数据出入口。所有页面通过它访问 Worker 上的 /api 接口，
// 页面组件里不再出现任何服务端代码。
import type {
	HoldingCardWithPrice,
	HoldingDetailPayload,
	Item,
	TradeDetail,
	TradeWithItem,
} from "../features/trade-record/types";

export interface StockSearchResult {
	symbol: string;
	description: string;
	exchange: string;
	type?: string;
}

interface RequestOptions {
	signal?: AbortSignal;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(path, {
		credentials: "same-origin",
		...init,
		headers: { Accept: "application/json", ...(init.headers || {}) },
	});

	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		const message =
			(payload as { error?: string } | null)?.error || `请求失败（${response.status}）`;
		throw new Error(message);
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

// ---------- 标的 ----------
export const fetchItems = (options: RequestOptions = {}) =>
	request<{ items: Item[] }>("/api/items", { signal: options.signal });

export const createItem = (
	payload: { name: string; symbol: string; description: string; exchange: string },
) => postJson<{ success: true }>("/api/items", payload);

export const deleteItem = (id: number) =>
	request<{ success: true; deletedId: number }>(`/api/items/${id}`, { method: "DELETE" });

// ---------- 持仓 ----------
export const fetchHoldings = (options: RequestOptions = {}) =>
	request<{ holdings: HoldingCardWithPrice[] }>("/api/holdings", { signal: options.signal });

export const fetchHoldingDetail = (itemId: number, options: RequestOptions = {}) =>
	request<HoldingDetailPayload>(`/api/holdings/${itemId}`, { signal: options.signal });

export const sellByItem = (payload: { itemId: number; price: number; qty: number }) =>
	postJson<{ success: true }>("/api/holdings/sell", payload);

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

// ---------- 行情搜索 ----------
export const searchStocks = (q: string, options: RequestOptions = {}) =>
	request<{ results: StockSearchResult[]; error?: string }>(
		`/api/stocks/search?q=${encodeURIComponent(q)}`,
		{ signal: options.signal },
	);

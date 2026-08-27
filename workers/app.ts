import { TradingDB } from "./server/db/client";
import { getStockProvider } from "./server/services/stock";

// 应用是纯 CSR 的 SPA，Worker 只做两件事：提供 /api JSON 接口、把其余路径回退到 index.html
export interface AppEnv extends Env {
	DB: D1Database;
	// 静态资源绑定，SPA 回退时用它取 index.html
	ASSETS: { fetch: (input: Request | URL | string) => Promise<Response> };
	FINNHUB_API_KEY?: string;
	QUOTE_CACHE_TTL?: string;
}

const json = (data: unknown, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			// 接口数据始终走网络，离线时由 Service Worker 回放缓存
			"Cache-Control": "no-store",
		},
	});

const fail = (message: string, status = 400) => json({ error: message }, status);

async function readPayload(request: Request): Promise<Record<string, unknown>> {
	const contentType = request.headers.get("content-type") || "";
	if (contentType.includes("application/json")) {
		return (await request.json()) as Record<string, unknown>;
	}
	const formData = await request.formData();
	return Object.fromEntries(formData.entries());
}

const num = (value: unknown) => Number(value);
const str = (value: unknown) => (value == null ? "" : String(value));

async function handleApi(request: Request, env: AppEnv, pathname: string): Promise<Response> {
	const db = new TradingDB(env.DB);
	const method = request.method.toUpperCase();
	const segments = pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
	const [resource, second, third] = segments;

	// ---------- 标的（items） ----------
	if (resource === "items") {
		if (!second && method === "GET") {
			return json({ items: await db.getAllItems() });
		}
		if (!second && method === "POST") {
			const body = await readPayload(request);
			const name = str(body.name);
			const symbol = str(body.symbol);
			if (!name || !symbol) return fail("数据不完整");
			await db.createItem({
				name,
				symbol,
				description: str(body.description),
				exchange: str(body.exchange),
			});
			return json({ success: true }, 201);
		}
		if (second && method === "DELETE") {
			const id = num(second);
			if (!id) return fail("无效的条目 ID");
			await db.deleteItem(id);
			return json({ success: true, deletedId: id });
		}
	}

	// ---------- 持仓（按标的聚合） ----------
	if (resource === "holdings") {
		if (!second && method === "GET") {
			const rawHoldings = await db.getOpenHoldings();
			const stockService = getStockProvider(env);
			// 报价按标的并发拉取，provider 内部有 TTL 缓存，重复标的不会重复请求
			const holdings = await Promise.all(
				rawHoldings.map(async (holding) => ({
					...holding,
					live_price: await stockService.getLivePrice(holding.item_name).catch(() => null),
				})),
			);
			return json({ holdings });
		}
		if (second === "sell" && method === "POST") {
			const body = await readPayload(request);
			await db.recordSellByItem(num(body.itemId), num(body.price), num(body.qty));
			return json({ success: true });
		}
		if (second && !third && method === "GET") {
			const itemId = num(second);
			if (!itemId) return fail("无效的标的 ID");
			return json(await db.getHoldingDetail(itemId));
		}
	}

	// ---------- 交易（trades） ----------
	if (resource === "trades") {
		if (!second && method === "GET") {
			return json({ trades: await db.getAllTrades() });
		}
		if (!second && method === "POST") {
			const body = await readPayload(request);
			const item_id = num(body.itemId);
			const current_price = num(body.currentPrice);
			const target_price = num(body.targetPrice);
			const stop_loss_price = num(body.stopLossPrice);
			const buy_quantity = num(body.buyQuantity);
			if (!item_id || !current_price || !target_price || !stop_loss_price || !buy_quantity) {
				return fail("核心数据不完整");
			}
			const id = await db.createTrade({
				item_id,
				current_price,
				target_price,
				stop_loss_price,
				buy_quantity,
				notes: str(body.notes).trim() || undefined,
			});
			return json({ id }, 201);
		}
		if (second && !third && method === "GET") {
			const trade = await db.getTradeDetail(num(second));
			if (!trade) return fail("交易记录不存在", 404);
			return json({ trade });
		}
		if (second && !third && method === "DELETE") {
			await db.deleteTrade(num(second));
			return json({ deleted: true });
		}
		if (second && third === "sell" && method === "POST") {
			const body = await readPayload(request);
			await db.recordSell(num(second), num(body.price), num(body.qty));
			return json({ success: true });
		}
	}

	// ---------- 行情搜索 ----------
	if (resource === "stocks" && second === "search" && method === "GET") {
		const q = new URL(request.url).searchParams.get("q")?.trim() || "";
		if (q.length < 2) return json({ results: [] });
		try {
			return json({ results: await getStockProvider(env).search(q) });
		} catch (error: any) {
			if (error?.message === "MISSING_API_KEY") {
				return json({ results: [], error: "未配置行情接口凭证，无法搜索股票" });
			}
			return json({ results: [], error: "获取数据失败，请稍后重试" });
		}
	}

	return fail("接口不存在", 404);
}

export default {
	async fetch(request: Request, env: AppEnv): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
			try {
				return await handleApi(request, env, url.pathname);
			} catch (error: any) {
				// 业务校验（例如卖出数量超出持仓）统一以 400 + message 返回，前端直接展示
				return fail(error?.message || "服务端异常", 400);
			}
		}

		// 静态资源命中不会走到这里；剩下的都是 SPA 的前端路由，回退到 index.html
		return env.ASSETS.fetch(new URL("/index.html", url.origin));
	},
};

import { TradingDB } from "./server/db/client";
import { getStockProvider } from "./server/services/stock";
import { getStockHistoryService } from "./server/services/stock/history";
import { DEFAULT_HISTORY_RANGE, isHistoryRange } from "../app/features/stock-chart/types";

// 应用是纯 CSR 的 SPA，Worker 只做两件事：提供 /api JSON 接口、把其余路径回退到 index.html
export interface AppEnv extends Env {
	DB: D1Database;
	// 静态资源绑定，SPA 回退时用它取 index.html
	ASSETS: { fetch: (input: Request | URL | string) => Promise<Response> };
	FINNHUB_API_KEY?: string;
	QUOTE_CACHE_TTL?: string;
	SEARCH_CACHE_TTL?: string;
	HISTORY_CACHE_TTL?: string;
	// 行情数据源开关，对应 services/stock/providers 注册表的 key
	STOCK_PROVIDER?: string;
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

// 成交时刻：日期必填，后面的时分秒可选（走势页改日期时会把原时分秒一起带回来）
const TIME_PATTERN = /^\d{4}-\d{2}-\d{2}([ T].*)?$/;

// 路径里的标的代码可能带 %2F 之类的转义，解不开就按原样用
function decodeSegment(segment: string): string {
	try {
		return decodeURIComponent(segment).trim();
	} catch {
		return segment.trim();
	}
}

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
			// 代码可以为空：自定义条目允许只有名称，此时不拉行情
			if (!name) return fail("请填写条目名称");
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
		// 编辑条目：只放开名称、代码、备注。exchange 是搜索结果带来的元数据，手改没有意义
		if (second && method === "PATCH") {
			const id = num(second);
			if (!id) return fail("无效的条目 ID");
			const body = await readPayload(request);
			const name = str(body.name).trim();
			if (!name) return fail("请填写条目名称");
			await db.updateItem(id, {
				name,
				symbol: str(body.symbol),
				description: str(body.description),
			});
			return json({ success: true });
		}
	}

	// ---------- 持仓（按标的聚合） ----------
	if (resource === "holdings") {
		if (!second && method === "GET") {
			const rawHoldings = await db.getOpenHoldings();
			const stockService = getStockProvider(env);
			// 报价按标的并发拉取，取的是标的代码（item_symbol）而不是展示名；缓存在 withStockCache 里
			const holdings = await Promise.all(
				rawHoldings.map(async (holding) => {
					// getQuote 内部已经吞掉异常，额外的 catch 只防御意料外的抛出
					const quote = await stockService
						.getQuote(holding.item_symbol)
						.catch(() => ({ price: null, fetchedAt: Date.now(), error: "QUOTE_FAILED" }));
					return {
						...holding,
						live_price: quote.price,
						// 抓取时刻交给前端判断「旧不旧」，异常原因用来区分「查不到」和「服务挂了」
						live_price_at: quote.fetchedAt,
						live_price_error: quote.error,
					};
				}),
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
		// 只改买入时刻：走势页上纠正买卖点日期，不动价格和数量
		if (second && !third && method === "PATCH") {
			const id = num(second);
			if (!id) return fail("无效的交易 ID");
			const body = await readPayload(request);
			const buyTime = str(body.buyTime).trim();
			if (!TIME_PATTERN.test(buyTime)) return fail("买入时间格式不正确");
			await db.updateTradeBuyTime(id, buyTime);
			return json({ success: true });
		}
		if (second && third === "sell" && method === "POST") {
			const body = await readPayload(request);
			await db.recordSell(num(second), num(body.price), num(body.qty));
			return json({ success: true });
		}
	}

	// ---------- 卖出记录（sell_records）----------
	if (resource === "sell-records" && second && !third && method === "PATCH") {
		const id = num(second);
		if (!id) return fail("无效的卖出记录 ID");
		const body = await readPayload(request);
		const sellTime = str(body.sellTime).trim();
		if (!TIME_PATTERN.test(sellTime)) return fail("卖出时间格式不正确");
		await db.updateSellRecordTime(id, sellTime);
		return json({ success: true });
	}

	// ---------- 行情搜索 ----------
	if (resource === "stocks" && second === "search" && method === "GET") {
		const q = new URL(request.url).searchParams.get("q")?.trim() || "";
		if (q.length < 2) return json({ results: [] });
		try {
			return json({ results: await getStockProvider(env).search(q) });
		} catch (error: any) {
			// 这些分支必须是非 2xx：Service Worker 的 api-cache 只收 200，
			// 否则「未配置凭证」这类响应会被当成正常结果缓存下来并在之后回放
			if (error?.message === "MISSING_API_KEY") {
				return json({ results: [], error: "未配置行情接口凭证，无法搜索股票" }, 503);
			}
			return json({ results: [], error: "获取数据失败，请稍后重试" }, 502);
		}
	}

	// ---------- 单标的报价（首页卡片的刷新按钮） ----------
	// 单标的粒度而不是整表刷新：Finnhub 免费额度 60 次/分钟，一次点击只花一次配额
	if (resource === "quotes" && second && !third && method === "GET") {
		const symbol = decodeSegment(second);
		if (!symbol) return fail("缺少标的代码");

		const force = new URL(request.url).searchParams.get("refresh") === "1";
		const quote = await getStockProvider(env).getQuote(symbol, { force });
		// 取不到价格时返回 502：SW 的 api-cache 只收 200，异常结果不能被缓存回放
		if (quote.price == null) {
			const message =
				quote.error === "NO_QUOTE" ? "未取到该标的报价" : "行情接口异常，请稍后重试";
			return json({ symbol, price: null, fetchedAt: quote.fetchedAt, reason: quote.error, error: message }, 502);
		}
		return json({ symbol, ...quote });
	}

	// ---------- 历史日线（走势图） ----------
	// 数据源是 Yahoo，与报价的 Finnhub 各走各的：Finnhub 免费档没有 candle 权限
	if (resource === "history" && second && !third && method === "GET") {
		const symbol = decodeSegment(second);
		if (!symbol) return fail("缺少标的代码");

		const historyUrl = new URL(request.url);
		const rangeParam = historyUrl.searchParams.get("range") || DEFAULT_HISTORY_RANGE;
		if (!isHistoryRange(rangeParam)) return fail("不支持的时间区间");
		// refresh=1 来自走势页的刷新按钮：清两级缓存 + 跳过 D1 新鲜短路，直接打上游
		const force = historyUrl.searchParams.get("refresh") === "1";

		try {
			const history = await getStockHistoryService(env).getHistory(symbol, rangeParam, { force });
			// 空序列同样按异常处理：SW 的 api-cache 只收 200，空曲线不能被缓存回放
			if (history.candles.length === 0) {
				return json({ symbol, range: rangeParam, candles: [], error: "未取到该标的历史数据" }, 502);
			}
			return json(history);
		} catch (error: any) {
			// Yahoo 按出口 IP 限流很常见（429），它和「代码不存在」「上游真挂了」要分开报，
			// 前端靠 reason 决定要不要给重试按钮上冷却
			const reason: string = error?.message || "HISTORY_UPSTREAM_ERROR";
			const limited = reason === "HISTORY_RATE_LIMITED";
			const message =
				reason === "NO_HISTORY"
					? "未取到该标的历史数据"
					: limited
						? "行情源限流，请稍后重试"
						: "历史行情接口异常，请稍后重试";
			return json(
				{ symbol, range: rangeParam, candles: [], reason, error: message },
				limited ? 429 : 502,
			);
		}
	}

		return fail("接口不存在", 404);
}

// 线上自检：只回布尔与长度，不回密钥本身。用于确认「secret 是否落到当前这个 Worker」
async function handleHealth(env: AppEnv): Promise<Response> {
	const key = env.FINNHUB_API_KEY || "";
	let dbOk = false;
	let dbError: string | undefined;
	let tables: string[] = [];
	const counts: Record<string, number | null> = {};

	const count = async (sql: string) => {
		try {
			const row = await env.DB.prepare(sql).first<{ c: number }>();
			return row?.c ?? null;
		} catch {
			return null;
		}
	};

	try {
		// 先确认这个 DB 绑定里到底有哪些表，再逐张数行数；
		// 「表在但行数为 0」和「表都不存在」是两种完全不同的故障
		const { results } = await env.DB.prepare(
			"select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '_cf_%' order by name",
		).all<{ name: string }>();
		tables = results.map((row) => row.name);
		dbOk = true;
	} catch (error: any) {
		dbError = error?.message || "unknown";
	}

	if (tables.includes("items")) counts.items = await count("select count(*) as c from items");
	if (tables.includes("trades")) {
		counts.trades = await count("select count(*) as c from trades");
		// 首页只渲染未平仓部分，全部卖完时首页为空但 trades 仍有数据
		counts.openTrades = await count(
			"select count(*) as c from trades where sold_quantity < buy_quantity",
		);
	}
	if (tables.includes("sell_records")) {
		counts.sellRecords = await count("select count(*) as c from sell_records");
	}

	return json({
		ok: dbOk && key.length > 0,
		hasQuoteKey: key.length > 0,
		quoteKeyLength: key.length,
		quoteCacheTtl: env.QUOTE_CACHE_TTL ?? null,
		searchCacheTtl: env.SEARCH_CACHE_TTL ?? null,
		stockProvider: env.STOCK_PROVIDER ?? "finnhub",
		db: dbOk ? "ok" : "error",
		dbError,
		tables,
		counts,
	});
}

export default {
	async fetch(request: Request, env: AppEnv): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
			if (url.pathname === "/api/health") return handleHealth(env);
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

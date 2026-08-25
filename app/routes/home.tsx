import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { SwipeAction } from "antd-mobile";
import { ChartNoAxesColumn, Plus } from "lucide-react";
import { TradingDB } from "../server/db/client.server";
import { getStockProvider } from "../server/services/stock"; // 👈 引入股票服务
import { HoldingCard } from "../features/trade-record/components/HoldingCard";
import { SellModal } from "../features/trade-record/components/SellModal";

// ==========================================
// 服务端逻辑
// ==========================================
export async function loader({ context }: { context: any }) {
	const db = new TradingDB(context.cloudflare.env.DB);
	const rawHoldings = await db.getOpenHoldings();

	// 初始化股票服务
	const stockService = getStockProvider(context.cloudflare.env);

	// 遍历所有持仓，并发拉取实时股价（得益于底层的缓存机制，相同的标的不会重复请求）
	const holdings = await Promise.all(
		rawHoldings.map(async (holding) => {
			// 此处的 item_name 一般就是 AAPL 等代码
			const livePrice = await stockService.getLivePrice(holding.item_name);
			return {
				...holding,
				live_price: livePrice
			};
		})
	);

	return { holdings };
}

export async function action({ request, context }: { request: Request, context: any }) {
	// 这里的 action 保持之前的卖出逻辑不变
	const formData = await request.formData();
	const intent = formData.get("intent");

	if (intent === "sell") {
		const itemId = Number(formData.get("itemId"));
		const price = Number(formData.get("price"));
		const qty = Number(formData.get("qty"));

		const db = new TradingDB(context.cloudflare.env.DB);
		try {
			await db.recordSellByItem(itemId, price, qty);
			return { success: true };
		} catch (error: any) {
			return { error: error.message };
		}
	}
	return null;
}

// ==========================================
// 客户端组件
// ==========================================
export default function HomeRoute() {
	const loaderData = useLoaderData<typeof loader>();
	const holdings = loaderData?.holdings || [];

	const navigate = useNavigate();
	const fetcher = useFetcher();
	const [sellHolding, setSellHolding] = useState<any>(null);

	return (
		<div style={{ minHeight: '100vh', backgroundColor: 'var(--app-bg-color)', paddingBottom: '100px' }}>
			<div style={{ padding: '16px 24px', fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>首页</div>

			<div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
				{holdings.length === 0 ? (
					<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
						<ChartNoAxesColumn size={56} color="#A855F7" style={{ marginBottom: '20px' }} />
						<div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>暂无持仓</div>
						<div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>点击右下角「＋」添加第一条记录</div>
					</div>
				) : (
					holdings.map((holding: any) => (
						<div key={holding.item_id} style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
							<SwipeAction
								rightActions={[{
									key: 'sell',
									text: '卖出',
									color: 'success',
									onClick: () => setSellHolding(holding)
								}]}
							>
								<div onClick={() => navigate(`/holdings/${holding.item_id}`)}>
									{/* 将附带了 live_price 的 holding 传给卡片 */}
									<HoldingCard holding={holding} />
								</div>
							</SwipeAction>
						</div>
					))
				)}
			</div>

			<div
				style={{
					position: 'fixed', right: '24px', bottom: 'calc(100px + env(safe-area-inset-bottom))',
					width: '48px', height: '48px', backgroundColor: '#6C5CE7', borderRadius: '24px',
					display: 'flex', alignItems: 'center', justifyContent: 'center',
					boxShadow: '0 8px 20px rgba(91, 65, 196, 0.38)', zIndex: 90
				}}
				onClick={() => navigate('/trade/new')}
			>
				<Plus size={28} color="#FFFFFF" />
			</div>

			<SellModal
				visible={!!sellHolding}
				holding={sellHolding}
				onClose={() => setSellHolding(null)}
				onConfirm={(price, qty) => {
					fetcher.submit(
						{ intent: 'sell', itemId: sellHolding.item_id, price: String(price), qty: String(qty) },
						{ method: 'post' }
					);
					setSellHolding(null);
				}}
			/>
		</div>
	);
}

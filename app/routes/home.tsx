import { useState, useEffect } from "react"; // 补上 useEffect
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { SwipeAction, Toast } from "antd-mobile"; // 补上 Toast
import { ChartNoAxesColumn, Plus } from "lucide-react";
import { TradingDB } from "../server/db/client.server";
import { HoldingCard } from "../features/trade-record/components/HoldingCard";
import { SellModal } from "../features/trade-record/components/SellModal";

export async function loader({ context }: { context: any }) {
	const db = new TradingDB(context.cloudflare.env.DB);
	const holdings = await db.getOpenHoldings();
	return { holdings };
}

export async function action({ request, context }: { request: Request, context: any }) {
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
			// 将真实的报错信息返回给前端
			return { error: error.message || "卖出失败，数据库异常" };
		}
	}
	return null;
}

export default function HomeRoute() {
	const loaderData = useLoaderData<typeof loader>();
	const holdings = loaderData?.holdings || [];

	const navigate = useNavigate();
	const fetcher = useFetcher();
	const [sellHolding, setSellHolding] = useState<any>(null);

	// 👈 核心修改：通过监听 fetcher 状态，来决定弹窗和真实提示
	useEffect(() => {
		if (fetcher.state === 'idle' && fetcher.data) {
			if (fetcher.data.error) {
				Toast.show({ icon: 'fail', content: fetcher.data.error });
			} else if (fetcher.data.success) {
				Toast.show({ icon: 'success', content: '卖出成功' });
				setSellHolding(null); // 服务端确认成功后，才关闭弹窗
			}
		}
	}, [fetcher.state, fetcher.data]);

	return (
		<div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#fff', paddingBottom: '100px' }}>
			<div style={{ padding: '16px 24px', fontSize: '24px', fontWeight: 600 }}>首页</div>

			<div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
				{holdings.length === 0 ? (
					<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
						<ChartNoAxesColumn size={56} color="#A855F7" style={{ marginBottom: '20px' }} />
						<div style={{ fontSize: '20px', fontWeight: 600 }}>暂无持仓</div>
						<div style={{ fontSize: '14px', color: '#6D6F7E', marginTop: '8px' }}>点击右下角「＋」添加第一条记录</div>
					</div>
				) : (
					holdings.map((holding: any) => (
						<div key={holding.item_id} style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #1A1C24' }}>
							<SwipeAction
								rightActions={[{
									key: 'sell',
									text: '卖出',
									color: 'success',
									onClick: () => setSellHolding(holding)
								}]}
							>
								<div onClick={() => navigate(`/holdings/${holding.item_id}`)}>
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
					// 👈 核心修改：明确指定 action 路径为 '/?index'，避免请求被 React Router 吞掉
					fetcher.submit(
						{ intent: 'sell', itemId: String(sellHolding.item_id), price: String(price), qty: String(qty) },
						{ method: 'post', action: '/?index' }
					);
				}}
			/>
		</div>
	);
}

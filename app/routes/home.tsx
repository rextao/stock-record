import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { SwipeAction } from "antd-mobile";
import { ChartNoAxesColumn, Percent } from "lucide-react";
import { HoldingCard } from "../features/trade-record/components/HoldingCard";
import { SellModal } from "../features/trade-record/components/SellModal";
import { EmptyState } from "../common/components/EmptyState";
import { FloatingActionButton } from "../common/components/FloatingActionButton";
import { fetchHoldings, sellByItem } from "../api/trading";
import styles from "./home.module.less";

// ==========================================
// 客户端数据加载（纯 CSR，全部走 /api）
// ==========================================
export async function clientLoader({ request }: { request: Request }) {
	return fetchHoldings({ signal: request.signal });
}

export async function clientAction({ request }: { request: Request }) {
	const formData = await request.formData();
	if (formData.get("intent") !== "sell") return null;

	try {
		await sellByItem({
			itemId: Number(formData.get("itemId")),
			price: Number(formData.get("price")),
			qty: Number(formData.get("qty")),
		});
		return { success: true };
	} catch (error: any) {
		return { error: error.message as string };
	}
}

// ==========================================
// 客户端组件
// ==========================================
export default function HomeRoute() {
	const loaderData = useLoaderData<typeof clientLoader>();
	const holdings = loaderData?.holdings || [];

	const navigate = useNavigate();
	const fetcher = useFetcher();
	const [sellHolding, setSellHolding] = useState<any>(null);

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<div className={styles.pageTitle}>首页</div>
				{/* 涨跌幅计算用得频繁，从标题栏直达，省掉「我的 → 工具」两跳 */}
				<button
					type="button"
					className={styles.headerAction}
					onClick={() => navigate('/tools/price-change')}
					aria-label="涨跌幅计算"
					title="涨跌幅计算"
				>
					<Percent size={18} />
				</button>
			</div>

			<div className={styles.list}>
				{holdings.length === 0 ? (
					<EmptyState
						icon={ChartNoAxesColumn}
						title="暂无持仓"
						description="点击右下角「＋」添加第一条记录"
					/>
				) : (
					holdings.map((holding: any) => (
						<div key={holding.item_id} className={styles.cardWrapper}>
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

			<FloatingActionButton aboveTabBar aria-label="新增交易记录" onClick={() => navigate('/trade/new')} />

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

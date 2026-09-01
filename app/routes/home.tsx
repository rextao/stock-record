import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher, useRevalidator } from "react-router";
import { PullToRefresh, SwipeAction } from "antd-mobile";
import { ChartNoAxesColumn, Percent } from "lucide-react";
import { HoldingCard } from "../features/trade-record/components/HoldingCard";
import { SellModal } from "../features/trade-record/components/SellModal";
import { EmptyState } from "../common/components/EmptyState";
import { FloatingActionButton } from "../common/components/FloatingActionButton";
import { fetchHoldings, sellByItem } from "../api/trading";
import styles from "./home.module.less";

/**
 * 下拉刷新的头部高度与触发阈值必须显式写死，不能用 antd-mobile 的默认值。
 *
 * 默认值是 render 时现算的 convertPx(40)/convertPx(60)，而 convertPx 靠往 body 插的
 * .adm-px-tester 探针实测高度换算 —— 那条 CSS 在 antd 的动态 chunk 里，不在 index.html 的
 * head 中，是首页渲染时才随 <Links/> 插入的，所以首屏第一次 render 量出来是 0。
 * headHeight 为 0 时橡皮筋公式 rubberbandIfOutOfBounds(y, 0, 0, headHeight * 5, 0.5) 恒返回 0，
 * status 永远停在 pulling，松手只回弹、不触发 onRefresh —— 表现就是「下拉完全没反应」。
 * 又因为首页数据走 clientLoader、渲染后没有 state 变化，整个生命周期只 render 一次，
 * 那个 0 会被一直留住；进二级页再回来重新 mount 时 CSS 已生效，所以才「返回后就好了」。
 */
const PULL_HEAD_HEIGHT = 40;
const PULL_THRESHOLD = 60;

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
	const revalidator = useRevalidator();
	const [sellHolding, setSellHolding] = useState<any>(null);

	/**
	 * 下拉刷新：重新走一遍 clientLoader，**不带 force**。
	 * 服务端的报价缓存只缓存成功结果（失败的不写缓存），所以正常标的直接命中缓存、
	 * 上次取数失败的标的会自然重试 —— 这正是「缓存期内用缓存，只重拉异常数据」的效果，
	 * 不需要额外的强制刷新参数。要强刷单个标的走卡片上的刷新按钮。
	 */
	const handleRefresh = async () => {
		await revalidator.revalidate();
	};

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

			<div className={styles.scrollArea}>
				<PullToRefresh
					onRefresh={handleRefresh}
					headHeight={PULL_HEAD_HEIGHT}
					threshold={PULL_THRESHOLD}
				>
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
				</PullToRefresh>
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

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { PullToRefresh, SwipeAction, SpinLoading, Toast } from "antd-mobile";
import { ChartNoAxesColumn, Percent } from "lucide-react";
import { HoldingCard } from "../features/trade-record/components/HoldingCard";
import { SellModal } from "../features/trade-record/components/SellModal";
import { EmptyState } from "../common/components/EmptyState";
import { FloatingActionButton } from "../common/components/FloatingActionButton";
import { ConnectionStatusIndicator } from "../common/network/ConnectionStatusBanner";
import { fetchHoldings, sellByItem } from "../api/trading";
import styles from "./home.module.less";

// 走势页组件放在 features/ 里、由本文件静态依赖：RR 会把 routes/ 下的路由模块
// 虚拟化成懒加载 chunk、无法被静态 import，所以组件得移出 routes 才能真正进入首页 chunk。
// 这样点「查看走势」时 Router 的 lazy import 直接命中已加载模块、瞬时完成导航；
// 行情/详情请求仍在跳过去之后由页面自己发，loading 显示在走势页里。
// 代价是首页首屏多加载这部分 JS；走势入口只在首页卡片上，这个交换划算。
import "../features/stock-chart/pages/HistoryPage";

/**
 * 下拉刷新的头部高度与触发阈值必须显式写死，不能用 antd-mobile 的默认值。
 *
 * 默认值是 render 时现算的 convertPx(40)/convertPx(60)，而 convertPx 靠往 body 插的
 * .adm-px-tester 探针实测高度换算 —— 那条 CSS 在 antd 的动态 chunk 里，不在 index.html 的
 * head 中，是首页渲染时才随 <Links/> 插入的，所以首屏第一次 render 量出来是 0。
 * headHeight 为 0 时橡皮筋公式 rubberbandIfOutOfBounds(y, 0, 0, headHeight * 5, 0.5) 恒返回 0，
 * status 永远停在 pulling，松手只回弹、不触发 onRefresh —— 表现就是「下拉完全没反应」。
 * 历史上首页数据走 clientLoader、渲染后无 state 变化，整个生命周期只 render 一次，
 * 那个 0 会被永久留住（进二级页再回来重新 mount 时 CSS 已生效才「返回后就好了」）。
 * 现在改成页内 useEffect 拉数据、会多次 render，但 headHeight 写死成常量后与 render
 * 时机无关，任何时候都取得到，别再改回 antd 默认值。
 */
const PULL_HEAD_HEIGHT = 40;
const PULL_THRESHOLD = 60;

// ==========================================
// 客户端组件
// ==========================================
export default function HomeRoute() {
	const navigate = useNavigate();
	const [holdings, setHoldings] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [sellHolding, setSellHolding] = useState<any>(null);

	/*
	 * 首页刻意不写 clientLoader，改成页内 useEffect 拉数据。
	 * RR7 的 clientLoader 会阻塞路由渲染，SPA 首屏在 loader 结算前只显示 HydrateFallback，
	 * PWA 从桌面冷启动时这段「加载中」会一直持续到 /api/holdings 返回 —— 每次进都白等一两秒。
	 * 改成先渲染骨架、再异步拉数据：冷启动瞬时进首页，loading 转圈收在列表区内。
	 */
	useEffect(() => {
		const controller = new AbortController();
		fetchHoldings({ signal: controller.signal })
			.then((res) => setHoldings(res.holdings || []))
			.catch((error: any) => {
				if (controller.signal.aborted) return;
				Toast.show(error?.message || "加载失败");
			})
			.finally(() => {
				if (controller.signal.aborted) return;
				setLoading(false);
			});
		return () => controller.abort();
	}, []);

	/*
	 * 下拉刷新 / 卖出后重新拉一次 /api/holdings，**不带 force**。
	 * 服务端只缓存成功的报价（失败不写缓存），所以正常标的直接命中缓存、上次失败的自然重试，
	 * 正是「缓存期内用缓存、只重拉异常数据」的效果。强刷单个标的走卡片上的刷新按钮。
	 */
	const reloadHoldings = async () => {
		try {
			const res = await fetchHoldings();
			setHoldings(res.holdings || []);
		} catch (error: any) {
			Toast.show(error?.message || "刷新失败");
		}
	};

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<div className={styles.titleGroup}>
					<div className={styles.pageTitle}>首页</div>
					<ConnectionStatusIndicator />
				</div>
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
					onRefresh={reloadHoldings}
					headHeight={PULL_HEAD_HEIGHT}
					threshold={PULL_THRESHOLD}
				>
					<div className={styles.list}>
						{loading ? (
							<div className={styles.loading}>
								<SpinLoading color="currentColor" />
								加载中
							</div>
						) : holdings.length === 0 ? (
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
				onConfirm={async (price, qty) => {
					const target = sellHolding;
					setSellHolding(null);
					if (!target) return;
					try {
						await sellByItem({ itemId: target.item_id, price, qty });
						await reloadHoldings();
					} catch (error: any) {
						Toast.show(error?.message || '卖出失败');
					}
				}}
			/>
		</div>
	);
}

import { useLoaderData } from "react-router";
import { TradingDB } from "../server/db/client.server";

// Loader 运行在服务端/边缘节点 (Cloudflare Worker)
export const loader = async ({ context }: { context: any }) => {
	// 假设你在 wrangler.toml 中绑定的 D1 变量名为 DB
	const db = new TradingDB(context.cloudflare.env.DB);

	// 获取所有的未平仓持仓数据
	const holdings = await db.getOpenHoldings();

	return { holdings };
};

export default function HomeRoute() {
	// 在客户端拿到服务端吐出的数据
	const { holdings } = useLoaderData<typeof loader>();

	return (
		<div style={{ padding: 16 }}>
			<h2>aaaa</h2>
			{holdings.length === 0 ? (
				<p>bvbbbb</p>
			) : (
				<ul>
					{holdings.map((h) => (
						<li key={h.item_id}>
							{h.item_name} - 持有量: {h.remaining_qty}
							(均价: {h.weighted_avg_price.toFixed(2)})
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

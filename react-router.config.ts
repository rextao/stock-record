import type { Config } from "@react-router/dev/config";

export default {
	// 纯客户端渲染：构建时只产出静态 index.html 外壳，运行时不做任何服务端渲染
	ssr: false,
	// 与 @cloudflare/vite-plugin 对齐：它固定把客户端产物写到 <root>/dist/client，
	// react-router 默认的 build/ 会导致两边找不到彼此的 manifest。
	buildDirectory: "dist",
} satisfies Config;

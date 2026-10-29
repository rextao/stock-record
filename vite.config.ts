import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
	// 监听 0.0.0.0，启动时 Vite 会自带打印 Network 局域网地址，方便手机直连
	server: {
		host: true,
	},
	plugins: [
		// 插件顺序按命令分流，两个方向各有各的坑，都不能动：
		// dev 必须 RR 在前 —— 两家的请求兜底中间件按插件顺序注册，RR 的页面渲染要先于
		//   cloudflare 的 catch-all，否则文档请求全被吸进 workerd 返回 404 空 body（手机
		//   浏览器会当成文件下载）；/api 由 wrangler.json 的 assets.run_worker_first 在
		//   更早的 preMiddleware 直接派发给 Worker，不受影响。
		// build 必须 cloudflare 在前 —— 它先调度 client 环境构建，RR 的 server build 才能
		//   读到 dist/client/.vite/manifest.json，反了会直接 ENOENT 构建失败。
		...(command === "serve" ? [reactRouter(), cloudflare()] : [cloudflare(), reactRouter()]),
		tsconfigPaths(),
		// Service Worker 不走 vite 插件：vite-plugin-pwa 会为 SW 起一个 outDir 指向 build/client
		// 的子构建，在 SPA 构建顺序下它先于客户端产物完成并清空目录。改由 scripts/build-sw.mjs
		// 在 react-router build 之后单独打包 + 注入预缓存清单。
	],
	ssr: {
		// 强制 Vite 在 SSR 构建时处理该组件库，正确提取 CSS 并发送给客户端
		noExternal: ['antd-mobile'],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./app"),
		},
	},

	css: {
		modules: {
			localsConvention: "camelCaseOnly", // 样式类名转驼峰
		},
		preprocessorOptions: {
			less: {
				javascriptEnabled: true,
				// 使用绝对路径动态注入，并转义 Windows 路径反斜杠
				additionalData: `@import "${path.resolve(__dirname, "app/styles/variables.less").replace(/\\/g, "/")}";`,
			},
		},
	},
}));

import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		// SPA 模式下 react-router 不再创建 ssr 环境，Worker 只承载 /api 与静态资源回退
		cloudflare(),
		reactRouter(),
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
});

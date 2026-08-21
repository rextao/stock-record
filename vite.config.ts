import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		reactRouter(),
		tsconfigPaths(),
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

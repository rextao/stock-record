import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		reactRouter(),
		tsconfigPaths(),
		// 👇 新增 PWA 插件配置
		VitePWA({
			registerType: 'autoUpdate', // 发现新版本时自动更新缓存
			injectRegister: null, // 我们将在 root.tsx 中手动注册，更受控
			manifest: false, // 设为 false，因为我们上一节已经在 public 目录手动创建了 manifest.json
			workbox: {
				// 自动缓存这些格式的静态资源
				globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
				runtimeCaching: [
					{
						// 针对所有的路由页面请求（HTML），使用“网络优先”策略
						urlPattern: ({ request }) => request.mode === 'navigate',
						handler: 'NetworkFirst',
						options: {
							cacheName: 'pages-cache',
							networkTimeoutSeconds: 3, // 如果网络差，3秒连不上就直接显示离线缓存
						}
					}
				]
			},
			devOptions: {
				enabled: true, // 开启此项，允许你在 npm run dev 下也能测试离线功能
				type: 'module'
			}
		})

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

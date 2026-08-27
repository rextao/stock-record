// app/root.tsx
import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	isRouteErrorResponse,
	useRouteError,
	type LinksFunction,
	type MetaFunction,
} from "react-router";
import globalStyles from "./styles/global.less?url";
import {useEffect} from "react";

export const meta: MetaFunction = () => [
	{ charSet: "utf-8" },
	{
		name: "viewport",
		content:
			"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
	},
	{ title: "H5 App" },
];

export const links: LinksFunction = () => [
	{ rel: "stylesheet", href: globalStyles },
];

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
		<head>
			<meta charSet="utf-8" />
			{/* 1. 优化 viewport：禁止缩放，并适配刘海屏 (viewport-fit=cover) */}
			<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />

			{/* 2. PWA 标准清单 */}
			<link rel="manifest" href="/manifest.json" />

			{/* 3. iOS 专属配置 */}
			{/* 允许全屏独立运行 */}
			<meta name="apple-mobile-web-app-capable" content="yes" />
			{/* 沉浸式状态栏：让顶部的系统时间、信号栏融入深色背景 */}
			<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
			{/* 保存在桌面时的 App 名称 */}
			<meta name="apple-mobile-web-app-title" content="啊呜啊呜" />
			{/* 桌面图标 (需配合下一步放置图片文件) */}
			<link rel="apple-touch-icon" href="/icon-192.png" />

			{/* 保持原有的标签 */}
			<Meta />
			<Links />
		</head>
		<body>
		{children}
		<ScrollRestoration />
		<Scripts />
		</body>
		</html>
	);
}
export default function App() {
	useEffect(() => {
		// 强制 antd-mobile 内部的所有组件（List、Popup、Dialog 等）使用深色主题
		document.documentElement.setAttribute('data-prefers-color-scheme', 'dark');
	}, []);

	useEffect(() => {
		if (!('serviceWorker' in navigator)) return;
		// sw.js 只在生产构建里生成（scripts/build-sw.mjs），dev 下注册会 404
		if (import.meta.env.DEV) return;

		const register = () => {
			navigator.serviceWorker
				.register('/sw.js', { type: 'classic', scope: '/' })
				.then((registration) => {
					console.log('SW 注册成功，应用已具备离线访问能力:', registration.scope);
				})
				.catch((error) => {
					console.error('SW 注册失败:', error);
				});
		};

		if (document.readyState === 'complete') {
			register();
		} else {
			window.addEventListener('load', register, { once: true });
			return () => window.removeEventListener('load', register);
		}
	}, []);

	return <Outlet />;
}

// SPA 模式下首屏由浏览器加载数据，加载完成前渲染这个占位，避免白屏闪烁
export function HydrateFallback() {
	return (
		<div
			style={{
				minHeight: '100vh',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: '#000',
				color: 'rgba(255, 255, 255, 0.55)',
				fontSize: '14px',
			}}
		>
			加载中...
		</div>
	);
}

// 离线且接口没有缓存时 clientLoader 会抛错，这里兜住，避免整页空白
export function ErrorBoundary() {
	const error = useRouteError();
	const message = isRouteErrorResponse(error)
		? `${error.status} ${error.statusText}`
		: error instanceof Error
			? error.message
			: "未知错误";
	const offline = typeof navigator !== "undefined" && !navigator.onLine;

	return (
		<div
			style={{
				minHeight: "100vh",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "12px",
				padding: "24px",
				backgroundColor: "#000",
				color: "#fff",
				textAlign: "center",
			}}
		>
			<div style={{ fontSize: "18px", fontWeight: 600 }}>
				{offline ? "当前处于离线状态" : "页面加载失败"}
			</div>
			<div style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.55)" }}>
				{offline ? "这部分数据还没有缓存，联网后可重新加载" : message}
			</div>
			<button
				type="button"
				onClick={() => window.location.reload()}
				style={{
					marginTop: "8px",
					padding: "10px 20px",
					borderRadius: "8px",
					border: "1px solid rgba(255, 255, 255, 0.2)",
					backgroundColor: "transparent",
					color: "#fff",
					fontSize: "14px",
				}}
			>
				重试
			</button>
		</div>
	);
}

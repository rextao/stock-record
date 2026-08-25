// app/root.tsx
import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
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
			<meta name="apple-mobile-web-app-title" content="交易账本" />
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
	return <Outlet />;
}

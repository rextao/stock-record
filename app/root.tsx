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
import { useEffect, useLayoutEffect } from "react";
import globalStyles from "./styles/global.less?url";
import {
	THEME_BOOTSTRAP_SCRIPT,
	applyResolvedTheme,
	readToken,
	useThemeStore,
} from "./common/theme/themeStore";
import styles from "./root.module.less";

export const meta: MetaFunction = () => [
	// charSet / viewport 已经在下面的 Layout 里手写，这里再给一份会在 index.html 中重复
	{ title: "啊呜啊呜" },
];

export const links: LinksFunction = () => [
	{ rel: "stylesheet", href: globalStyles },
];

export function Layout({ children }: { children: React.ReactNode }) {
	// 主题作为 React 声明式属性渲染在 <html> 上，而不是只靠下面那段 bootstrap 脚本：
	// hydration 失配时 React 会重建 documentElement，脚本写上去的属性会被一起丢掉，
	// 表现就是刷新后回落到 :root 的浅色基线。由 React 渲染则任何一条路径都带得上。
	const resolvedTheme = useThemeStore((s) => s.resolved);

	return (
		<html lang="zh-CN" data-prefers-color-scheme={resolvedTheme} suppressHydrationWarning>
		<head>
			{/* 主题必须在首屏绘制前定下来：SW 预缓存的是同一份静态 index.html，
			    这段同步脚本读 localStorage 并落 data-prefers-color-scheme，避免闪白 */}
			<script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />

			<meta charSet="utf-8" />
			{/* 1. 优化 viewport：禁止缩放，并适配刘海屏 (viewport-fit=cover) */}
			<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />

			{/* 2. PWA 标准清单 */}
			<link rel="manifest" href="/manifest.json" />

			{/* 浏览器地址栏配色，随系统偏好给两套，运行时再按实际主题校正 */}
			<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f5f6f8" />
			<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />

			{/* 3. iOS 专属配置 */}
			{/* 允许全屏独立运行 */}
			<meta name="apple-mobile-web-app-capable" content="yes" />
			{/* 状态栏样式随主题在运行时切换，这里给深色默认值 */}
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
	const resolvedTheme = useThemeStore((s) => s.resolved);
	const syncWithSystem = useThemeStore((s) => s.syncWithSystem);

	// 首帧提交前把主题属性写回 <html>：Layout 已经声明式渲染了它，这里再兜一层，
	// 覆盖 React 重建 documentElement 或第三方脚本改动属性的情况，且不会闪白。
	useLayoutEffect(() => {
		applyResolvedTheme();
	}, [resolvedTheme]);

	// mode 为 system 时跟随系统切换
	useEffect(() => syncWithSystem(), [syncWithSystem]);

	// 让浏览器地址栏 / iOS 状态栏跟上当前主题
	useEffect(() => {
		const appBg = readToken("--app-bg");
		document
			.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
			.forEach((el) => {
				if (!el.media) el.content = appBg;
			});

		const statusBar = document.querySelector<HTMLMetaElement>(
			'meta[name="apple-mobile-web-app-status-bar-style"]',
		);
		if (statusBar) {
			statusBar.content = resolvedTheme === "dark" ? "black-translucent" : "default";
		}
	}, [resolvedTheme]);

	useEffect(() => {
		if (!('serviceWorker' in navigator)) return;
		// sw.js 只在生产构建里生成（scripts/build-sw.mjs），dev 下注册会 404
		if (import.meta.env.DEV) return;

		// 新 SW 里带 skipWaiting + clientsClaim，激活后会立刻接管本页面，同时清掉上一版
		// 的预缓存条目。旧页面继续留在屏幕上就可能再去请求已被删除的懒加载 chunk，
		// 离线时直接失败。所以一旦控制权易手就整页重载一次，拿到与缓存一致的版本。
		let reloading = false;
		const onControllerChange = () => {
			if (reloading) return;
			reloading = true;
			window.location.reload();
		};
		// 首次安装（此前没有 controller）不需要重载，页面本来就是最新的
		const hadController = Boolean(navigator.serviceWorker.controller);
		if (hadController) {
			navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
		}

		const register = () => {
			navigator.serviceWorker
				.register('/sw.js', { type: 'classic', scope: '/' })
				.then((registration) => {
					console.log('SW 注册成功，应用已具备离线访问能力:', registration.scope);
					// 页面长期停留时也定期查一次新版本
					setInterval(() => void registration.update(), 60 * 60 * 1000);
				})
				.catch((error) => {
					console.error('SW 注册失败:', error);
				});
		};

		if (document.readyState === 'complete') {
			register();
			return () => {
				navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
			};
		}

		window.addEventListener('load', register, { once: true });
		return () => {
			window.removeEventListener('load', register);
			navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
		};
	}, []);

	return <Outlet />;
}

// SPA 模式下首屏由浏览器加载数据，加载完成前渲染这个占位，避免白屏闪烁
export function HydrateFallback() {
	return <div className={styles.fallback}>加载中...</div>;
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
		<div className={styles.errorPage}>
			<div className={styles.errorTitle}>
				{offline ? "当前处于离线状态" : "页面加载失败"}
			</div>
			<div className={styles.errorMessage}>
				{offline ? "这部分数据还没有缓存，联网后可重新加载" : message}
			</div>
			<button type="button" onClick={() => window.location.reload()} className={styles.retryButton}>
				重试
			</button>
		</div>
	);
}

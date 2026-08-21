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

export default function App() {
	return (
		// 1. 在 html 标签上添加 suppressHydrationWarning
		<html lang="zh-CN" suppressHydrationWarning>
		<head>
			<Meta />
			<Links />
		</head>
		{/* 2. 删掉原先那一大长串的 style={{ margin: 0, padding: 0... }} */}
		{/* 3. 在 body 标签上添加 suppressHydrationWarning 防止浏览器插件注入引发报错 */}
		<body suppressHydrationWarning>
		<Outlet />
		<ScrollRestoration />
		<Scripts />
		</body>
		</html>
	);
}

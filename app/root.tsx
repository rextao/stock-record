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
			<meta name="viewport" content="width=device-width, initial-scale=1" />
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

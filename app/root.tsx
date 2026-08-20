// app/root.tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration, type MetaFunction } from "react-router";
import "./styles/global.less";

export const meta: MetaFunction = () => [
	{ charSet: "utf-8" },
	{
		name: "viewport",
		content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
	},
	{ title: "H5 App" },
];

export default function App() {
	return (
		<html lang="zh-CN">
		<head>
			<Meta />
			<Links />
		</head>
		<body>
		<Outlet />
		<ScrollRestoration />
		<Scripts />
		</body>
		</html>
	);
}

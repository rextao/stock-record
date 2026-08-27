// @types/react-dom@18 没有为 react-dom/server.browser 提供声明，但它的导出与
// react-dom/server 的类型完全一致（含基于 Web Streams 的 renderToReadableStream）。
declare module "react-dom/server.browser" {
	export * from "react-dom/server";
}

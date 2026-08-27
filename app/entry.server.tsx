import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";
// 用 server.browser 入口：它导出基于 Web Streams 的 renderToReadableStream，
// 在 Node 18+ 和 workerd 里都能跑，省掉 node:stream 依赖。
import { renderToReadableStream } from "react-dom/server.browser";

/**
 * 这个文件只在 `react-router build` 的预渲染阶段执行一次，产出静态的 dist/client/index.html 外壳。
 * 运行时没有任何服务端渲染：线上由 Cloudflare 直接返回这个 HTML，数据全部在浏览器里通过 /api 获取。
 *
 * 必须用流式 API 并等到 allReady：react-router 的 <Scripts /> 先写出一个 ReadableStream，
 * 之后才在 Suspense 边界里往流中 enqueue 路由上下文并 close。renderToString 拿不到这些后续
 * chunk，浏览器端 hydration 会一直 await 这个永不关闭的流，页面就卡在 HydrateFallback。
 */
export default async function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
) {
	let statusCode = responseStatusCode;

	const stream = await renderToReadableStream(
		<ServerRouter context={routerContext} url={request.url} />,
		{
			onError(error) {
				statusCode = 500;
				console.error(error);
			},
		},
	);

	// 等所有 Suspense 边界都 flush 完，否则会丢掉路由上下文的 stream chunk
	await stream.allReady;
	const html = await new Response(stream).text();

	responseHeaders.set("Content-Type", "text/html");
	return new Response(`<!DOCTYPE html>${html}`, {
		headers: responseHeaders,
		status: statusCode,
	});
}

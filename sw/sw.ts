/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
	cleanupOutdatedCaches,
	createHandlerBoundToURL,
	precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: Array<{ url: string; revision?: string | null }>;
};

// 立即接管：配合 root.tsx 里的 controllerchange 重载，保证页面和预缓存版本始终一致
self.skipWaiting();
clientsClaim();

// 页面主动要求跳过等待（预留给"发现新版本"这类交互）
self.addEventListener('message', (event) => {
	if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
		void self.skipWaiting();
	}
});

// 纯 CSR 之后构建产物里有真正的 index.html，连同 JS / CSS / 图标一起进预缓存，
// 这是离线可用的前提：应用外壳完全来自 Cache Storage，不需要任何服务端渲染。
// 清单由 scripts/build-sw.mjs 在构建后注入，包含所有懒加载路由 chunk，
// 因此没访问过的页面在离线时也能渲染出来（只是数据要看 api-cache 有没有命中）。
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const isApi = (url: URL) => url.pathname === '/api' || url.pathname.startsWith('/api/');

// 任意前端路由（/、/chart、/holdings/3 ...）的导航请求都用预缓存的 index.html 应答，
// 命中的是 Cache Storage，离线和在线都是同一条零网络的快路径。
registerRoute(
	new NavigationRoute(createHandlerBoundToURL('/index.html'), {
		// 接口不参与导航回退
		denylist: [/^\/api\//],
	}),
);

// 接口写操作（POST / DELETE）故意不注册路由：workbox 的 router 默认只接管 GET，
// 它们会走浏览器默认的网络请求，绝不会被缓存策略吞掉。

// 接口数据：优先网络，成功后写缓存；断网时 fetch 会立刻 reject 并回放上一次的数据，
// 页面不会白屏。这里刻意不用 StaleWhileRevalidate —— 持仓和报价属于要求准确的数据，
// 在线时不应该先渲染一份过期结果。首屏速度由上面的外壳预缓存负责。
registerRoute(
	({ url, request }) => request.method === 'GET' && isApi(url),
	new NetworkFirst({
		cacheName: 'api-cache',
		networkTimeoutSeconds: 3,
		plugins: [
			new CacheableResponsePlugin({ statuses: [200] }),
			new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 }),
		],
	}),
);

// 预缓存清单之外的同源静态资源兜底（运行时才被引用到的图片、字体等）。
// 上面的 precacheAndRoute 已经先注册，带 hash 的产物不会走到这里。
registerRoute(
	({ url, request }) =>
		url.origin === self.location.origin &&
		!isApi(url) &&
		['image', 'font', 'style', 'script'].includes(request.destination),
	new CacheFirst({
		cacheName: 'static-assets',
		plugins: [
			new CacheableResponsePlugin({ statuses: [0, 200] }),
			new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 }),
		],
	}),
);

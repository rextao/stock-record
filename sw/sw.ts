/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
	cleanupOutdatedCaches,
	createHandlerBoundToURL,
	precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: Array<{ url: string; revision?: string | null }>;
};

self.skipWaiting();
clientsClaim();

// 纯 CSR 之后构建产物里有真正的 index.html，连同 JS / CSS / 图标一起进预缓存，
// 这是离线可用的前提：应用外壳完全来自 Cache Storage，不需要任何服务端渲染。
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// 任意前端路由（/、/chart、/holdings/3 ...）的导航请求都用预缓存的 index.html 应答，
// 剩下的路由匹配由浏览器里的 react-router 完成。
registerRoute(
	new NavigationRoute(createHandlerBoundToURL('/index.html'), {
		// 接口不参与导航回退
		denylist: [/^\/api\//],
	}),
);

// 接口数据：优先网络，成功后写缓存；断网时回放上一次的数据，页面不会白屏
registerRoute(
	({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/'),
	new NetworkFirst({
		cacheName: 'api-cache',
		networkTimeoutSeconds: 3,
		plugins: [
			new CacheableResponsePlugin({ statuses: [200] }),
			new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 }),
		],
	}),
);

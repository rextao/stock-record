/// <reference lib="webworker" />
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: Array<{ url: string; revision?: string | null }>;
};

// 构建期由 scripts/build-sw.mjs 注入的真实文件清单（含 index.html 与所有懒加载 chunk）
const MANIFEST = self.__WB_MANIFEST;

// 应用外壳路径：刻意用 '/' 而不是 '/index.html'。Cloudflare 静态资源的默认
// html_handling 会把 /index.html 301 到 /，而 Cache.put 拒绝写入重定向响应，
// 用 '/' 拿到的是干净的 200。
const SHELL_PATH = '/';

const toPath = (url: string) => {
	const { pathname } = new URL(url, self.location.origin);
	return pathname === '/index.html' ? SHELL_PATH : pathname;
};

const PRECACHE_PATHS = Array.from(new Set(MANIFEST.map((entry) => toPath(entry.url))));
const PRECACHED = new Set(PRECACHE_PATHS);

// 缓存名带清单指纹（fnv1a）：产物一变就是一个新缓存，activate 时删掉旧的，
// 不会出现「新 JS + 旧 HTML」这种半新半旧的组合。
const fingerprint = () => {
	const source = MANIFEST.map((entry) => `${entry.url}|${entry.revision ?? ''}`).join(',');
	let hash = 0x811c9dc5;
	for (let i = 0; i < source.length; i += 1) {
		hash ^= source.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
};

const PRECACHE_PREFIX = 'app-precache-';
const PRECACHE_NAME = PRECACHE_PREFIX + fingerprint();

const isApi = (url: URL) => url.pathname === '/api' || url.pathname.startsWith('/api/');

// Chrome 不允许把 redirected 响应写进 Cache，重建一份等价响应绕过限制
const stripRedirect = async (response: Response) => {
	if (!response.redirected) return response;
	return new Response(await response.blob(), {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
};

// 自检入口：离线时也能访问（由下面的路由接管）。返回 JSON 就证明 SW 确实在拦请求。
const STATUS_PATH = '/__sw/status';

const readCacheState = async () => {
	try {
		const cache = await caches.open(PRECACHE_NAME);
		const keys = await cache.keys();
		return {
			cached: keys.length,
			hasShell: keys.some((req) => new URL(req.url).pathname === SHELL_PATH),
		};
	} catch (error) {
		return { cached: -1, hasShell: false, error: String(error) };
	}
};

// 外壳彻底取不到时的最后一道兜底。刻意返回一个自带说明的 HTML 而不是让 respondWith
// 抛错：一旦抛错，浏览器会显示自己的网络错误页（「您目前处于离线状态」），
// 那一页会掩盖真实原因，看起来跟「SW 完全没生效」一模一样，无法区分。
const shellMissPage = async (reason: string) => {
	const state = await readCacheState();
	const rows = [
		['缓存名', PRECACHE_NAME],
		['应缓存', `${PRECACHE_PATHS.length} 个`],
		['实际缓存', `${state.cached} 个`],
		['外壳 (' + SHELL_PATH + ')', state.hasShell ? '在缓存里' : '不在缓存里'],
		['失败原因', reason],
	]
		.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`)
		.join('');

	const body =
		'<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
		'<meta name="viewport" content="width=device-width,initial-scale=1">' +
		'<title>离线外壳缺失</title><style>' +
		'body{margin:0;padding:24px;background:#000;color:#eee;font:14px/1.6 -apple-system,system-ui,sans-serif}' +
		'h1{font-size:17px;margin:0 0 4px}p{color:#888;margin:0 0 20px}' +
		'table{border-collapse:collapse;width:100%;max-width:420px}' +
		'th,td{text-align:left;padding:6px 0;border-bottom:1px solid #222;font-weight:400}' +
		'th{color:#888;width:38%}' +
		'button{margin-top:20px;padding:8px 18px;border:1px solid #333;border-radius:6px;background:#111;color:#eee;font-size:14px}' +
		'</style></head><body><h1>离线外壳缺失</h1>' +
		'<p>Service Worker 已接管这次请求，但缓存里取不到应用外壳。</p>' +
		`<table>${rows}</table>` +
		'<button onclick="location.reload()">重试</button></body></html>';

	return new Response(body, {
		status: 200,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	});
};

// 必须注册在 NavigationRoute 之前：workbox 按注册顺序匹配，否则会被导航路由吃掉
registerRoute(
	({ url }) => url.pathname === STATUS_PATH,
	async () => {
		const state = await readCacheState();
		return new Response(
			JSON.stringify(
				{
					scope: self.registration.scope,
					precacheName: PRECACHE_NAME,
					shellPath: SHELL_PATH,
					expected: PRECACHE_PATHS.length,
					...state,
				},
				null,
				2,
			),
			{
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
					'Cache-Control': 'no-store',
				},
			},
		);
	},
);

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(PRECACHE_NAME);
			// 刻意用 allSettled 逐个写入，而不是 cache.addAll / workbox 的 precacheAndRoute：
			// 后者是全有或全无，几十个请求里任意一个失败就会让 install reject，SW 直接变成
			// redundant，设备上一份缓存都没有，断网时只能看到浏览器自带的错误页。
			// 逐个写入只会丢掉个别失败项，外壳和绝大多数产物一定能落地。
			const results = await Promise.allSettled(
				PRECACHE_PATHS.map(async (path) => {
					const response = await fetch(path, {
						cache: 'reload',
						credentials: 'same-origin',
					});
					if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`);
					await cache.put(path, await stripRedirect(response));
				}),
			);

			const failed = results.flatMap((result, index) =>
				result.status === 'rejected' ? [PRECACHE_PATHS[index]] : [],
			);
			if (failed.length) {
				console.warn(`[sw] ${failed.length} 个资源预缓存失败：`, failed);
			}
			console.log(
				`[sw] 离线缓存就绪：${PRECACHE_PATHS.length - failed.length}/${PRECACHE_PATHS.length} 个资源（${PRECACHE_NAME}）`,
			);

			await self.skipWaiting();
		})(),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys();
			await Promise.all(
				names
					.filter((name) => name.startsWith(PRECACHE_PREFIX) && name !== PRECACHE_NAME)
					.map((name) => caches.delete(name)),
			);
			await self.clients.claim();
		})(),
	);
});

// 页面主动要求跳过等待（预留给"发现新版本"这类交互）
self.addEventListener('message', (event) => {
	if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
		void self.skipWaiting();
	}
});

// 任意前端路由（/、/chart、/holdings/3 ...）的导航请求都用缓存里的外壳应答。
// 依次降级：当前版本外壳 -> 忽略查询串的任意版本外壳 -> 旧版可能存在的 /index.html -> 网络。
// 「旧壳子」远好过「打不开」。
registerRoute(
	new NavigationRoute(
		async ({ request }) => {
			const candidates: Array<Promise<Response | undefined>> = [
				caches.match(SHELL_PATH, { cacheName: PRECACHE_NAME }),
				caches.match(SHELL_PATH, { ignoreSearch: true }),
				caches.match('/index.html', { ignoreSearch: true }),
			];
			for (const candidate of candidates) {
				const cached = await candidate;
				if (cached) return cached;
			}
			// 缓存全部落空才回网络；网络也失败时返回自检页，绝不把异常抛回浏览器
			try {
				return await fetch(request);
			} catch (error) {
				return shellMissPage(String(error));
			}
		},
		{
			// 接口不参与导航回退
			denylist: [/^\/api\//],
		},
	),
);

// 预缓存清单内的产物：直接读缓存，零网络，离线和在线走同一条快路径
registerRoute(
	({ url, request }) =>
		request.method === 'GET' &&
		url.origin === self.location.origin &&
		PRECACHED.has(url.pathname),
	new CacheFirst({
		cacheName: PRECACHE_NAME,
		plugins: [new CacheableResponsePlugin({ statuses: [200] })],
	}),
);

// 接口写操作（POST / DELETE）故意不注册路由：workbox 的 router 默认只接管 GET，
// 它们会走浏览器默认的网络请求，绝不会被缓存策略吞掉。

// 接口数据：优先网络，成功后写缓存；断网时 fetch 会立刻 reject 并回放上一次的数据，
// 页面不会白屏。这里刻意不用 StaleWhileRevalidate —— 持仓和报价属于要求准确的数据，
// 在线时不应该先渲染一份过期结果。首屏速度由上面的外壳预缓存负责。
registerRoute(
	// /api/quotes 是手动刷新触发的，故意不进缓存策略：NetworkFirst 的 3 秒超时会在弱网下
	// 回放一份旧报价，而用户点刷新就是想拿最新的。离线时它直接失败，卡片显示异常标记。
	({ url, request }) =>
		request.method === 'GET' && isApi(url) && !url.pathname.startsWith('/api/quotes'),
	new NetworkFirst({
		cacheName: 'api-cache',
		networkTimeoutSeconds: 3,
		plugins: [
			new CacheableResponsePlugin({ statuses: [200] }),
			new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 }),
		],
	}),
);

// 清单之外的同源静态资源兜底（运行时才被引用到的图片、字体等）
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

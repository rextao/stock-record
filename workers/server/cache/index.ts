// 与业务、数据源都无关的通用缓存层。
// 两级：L1 是 isolate 内存（同一实例内零开销），L2 是 Cloudflare Cache API（跨 isolate、同机房共享）。
// 只有 L2 才能真正兑现「N 分钟内不打第三方」，因为 Workers 随时创建/回收 isolate，内存 Map 命中率不可控。

interface MemoryEntry {
	value: unknown;
	expiresAt: number;
}

// 所有命名空间共用一张表，key 已经带 namespace 前缀
const memory = new Map<string, MemoryEntry>();

// Cache API 的 key 必须是合法 http(s) URL，这里用一个不会真的发出请求的内部域名
const CACHE_ORIGIN = "https://cache.internal";

function edgeCache(): Cache | null {
	try {
		// 本地某些运行时下 caches 可能不存在，拿不到就退化成纯内存缓存
		return (globalThis as any).caches?.default ?? null;
	} catch {
		return null;
	}
}

export interface WrapOptions<T> {
	/** 缓存有效期（秒）。<= 0 表示不缓存，直接透传 */
	ttlSeconds: number;
	/**
	 * 是否值得写入缓存。默认写入一切非 null/undefined 的值。
	 * 空数组、null 这类「查失败的结果」不该被缓存住，否则一次抖动会连续影响一个 TTL 周期。
	 */
	shouldCache?: (value: T) => boolean;
}

export interface CacheNamespace {
	/** 读缓存，未命中时执行 loader 并回填。loader 抛错时不写缓存，错误原样抛出 */
	wrap<T>(keyParts: (string | number)[], options: WrapOptions<T>, loader: () => Promise<T>): Promise<T>;
	/** 主动失效某个 key（例如写操作之后） */
	invalidate(keyParts: (string | number)[]): Promise<void>;
}

/**
 * 创建一个命名空间隔离的缓存句柄。任何服务（行情、新闻、汇率……）都可以自己 createCache 复用同一套逻辑。
 */
export function createCache(namespace: string): CacheNamespace {
	const urlOf = (keyParts: (string | number)[]) =>
		`${CACHE_ORIGIN}/${encodeURIComponent(namespace)}/${keyParts.map((part) => encodeURIComponent(String(part))).join("/")}`;

	const readEdge = async (url: string): Promise<{ hit: boolean; value: unknown }> => {
		const cache = edgeCache();
		if (!cache) return { hit: false, value: null };
		try {
			// Cache API 自己按 Cache-Control 判定过期，命中即视为未过期
			const cached = await cache.match(url);
			if (!cached) return { hit: false, value: null };
			return { hit: true, value: await cached.json() };
		} catch {
			return { hit: false, value: null };
		}
	};

	const writeEdge = async (url: string, value: unknown, ttlSeconds: number) => {
		const cache = edgeCache();
		if (!cache) return;
		try {
			await cache.put(
				url,
				new Response(JSON.stringify(value), {
					headers: {
						"Content-Type": "application/json; charset=utf-8",
						"Cache-Control": `max-age=${Math.floor(ttlSeconds)}`,
					},
				}),
			);
		} catch (error) {
			// 缓存写失败只影响命中率，不该让业务请求失败
			console.warn(`[cache] put failed: ${url}`, error);
		}
	};

	return {
		async wrap<T>(keyParts: (string | number)[], options: WrapOptions<T>, loader: () => Promise<T>): Promise<T> {
			const { ttlSeconds, shouldCache } = options;
			if (!(ttlSeconds > 0)) return loader();

			const url = urlOf(keyParts);
			const now = Date.now();

			const local = memory.get(url);
			if (local && local.expiresAt > now) return local.value as T;

			const edge = await readEdge(url);
			if (edge.hit) {
				memory.set(url, { value: edge.value, expiresAt: now + ttlSeconds * 1000 });
				return edge.value as T;
			}

			const value = await loader();
			const worth = shouldCache ? shouldCache(value) : value !== null && value !== undefined;
			if (worth) {
				memory.set(url, { value, expiresAt: now + ttlSeconds * 1000 });
				await writeEdge(url, value, ttlSeconds);
			}
			return value;
		},

		async invalidate(keyParts: (string | number)[]): Promise<void> {
			const url = urlOf(keyParts);
			memory.delete(url);
			const cache = edgeCache();
			if (!cache) return;
			try {
				await cache.delete(url);
			} catch {
				// 同上，失效失败不影响主流程
			}
		},
	};
}

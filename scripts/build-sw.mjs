// 在 `react-router build` 之后运行：把 sw/sw.ts 打包成经典脚本，并把 dist/client 下的
// 静态产物注入成预缓存清单，最终写出 dist/client/sw.js。
//
// 之所以不用 vite-plugin-pwa：injectManifest 策略下它会另起一个 outDir 指向客户端目录的
// vite 子构建，SPA 模式的构建顺序里这个子构建先跑完并清空目录，客户端产物会被整体擦掉。
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { injectManifest } from "workbox-build";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 客户端产物目录：react-router.config.ts 的 buildDirectory 为 dist
const clientDir = path.join(root, "dist", "client");
const tmpDir = path.join(root, "node_modules", ".cache", "sw");
const bundledSw = path.join(tmpDir, "sw.js");
const swDest = path.join(clientDir, "sw.js");

async function exists(target) {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

if (!(await exists(path.join(clientDir, "index.html")))) {
	console.error(
		"[build-sw] 找不到 dist/client/index.html，请先执行 react-router build。",
	);
	process.exit(1);
}

await fs.mkdir(tmpDir, { recursive: true });

// 打成 iife 经典脚本：注册时不需要 { type: 'module' }，兼容性最好
await esbuild({
	entryPoints: [path.join(root, "sw", "sw.ts")],
	outfile: bundledSw,
	bundle: true,
	format: "iife",
	platform: "browser",
	target: "es2020",
	minify: true,
	define: { "process.env.NODE_ENV": '"production"' },
});

// 把 self.__WB_MANIFEST 替换成真实的文件清单（含 index.html，这是离线可用的关键）
const { count, size, warnings } = await injectManifest({
	swSrc: bundledSw,
	swDest,
	globDirectory: clientDir,
	globPatterns: ["**/*.{js,css,html,ico,png,svg,json,woff,woff2}"],
	globIgnores: ["sw.js", "workbox-*.js"],
	maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
});

for (const warning of warnings) console.warn("[build-sw]", warning);
console.log(
	`[build-sw] 已生成 dist/client/sw.js，预缓存 ${count} 个文件，共 ${(size / 1024).toFixed(1)} KB`,
);

# stock-record 项目上下文

> 给 AI 编码助手看的项目说明。**动手前先读这份文件，不要从零扫全仓**。
> 这是唯一真相；`app/README.md` 是早期的目录规划稿，与现状有出入（例如 `app/server/` 并不存在，服务端代码在 `workers/`），仅作参考。
> 改动结构、约定、命令、踩坑结论时，顺手更新本文件。

## 是什么

个人股票交易记录 App。移动端 H5，全中文界面，部署在 Cloudflare Workers 上，线上地址 `https://stock.rextao666.workers.dev`。

技术栈：React 18 + React Router 7（**纯 CSR / SPA，`ssr: false`**）+ antd-mobile 5 + zustand + Less/CSS Modules；后端是同一个 Worker（`workers/app.ts`）+ D1（SQLite）；行情数据来自 Finnhub。

## 命令

需要 Node >= 24.18.0（本机装在 `~/.nvm/versions/node/v24.18.0/bin`，默认 node 是 20，先 `export PATH=...` 再跑）。

```bash
npm run dev      # vite dev server，纯前端，/api 不通
npm run preview  # build + 打印局域网 IP + wrangler dev（真机/PWA 调试走这个，端口 8788）
npm run build    # react-router build + scripts/build-sw.mjs 生成 sw.js
npm run deploy   # build + wrangler deploy
npx tsc -b --force   # 类型检查，期望 exit 0
```

**`npm run typecheck` 是坏的**（调的是不存在的 `typegen` 脚本，真名叫 `cf-typegen`），别用。新增路由后先 `npx react-router typegen`。

## 目录地图

```
app/
  root.tsx                  HTML 外壳、主题引导脚本、SW 注册脚本（生产环境内联在 <head>）
  routes.ts                 路由表；BasicLayout 内的页面有 TabBar，外面的没有
  routes/                   页面，每个页面一个同名 .module.less
  features/                 业务模块（trade-record、stock-chart），组件与类型
  common/                   layouts / components / theme(themeStore) / pwa(swBootstrap)
  api/trading.ts            前端请求封装
  styles/                   tokens.less（CSS 变量·主题令牌）、variables.less（Less 变量·自动注入）、global.less
  utils/calculations.ts     纯计算
workers/
  app.ts                    Worker 入口：/api 路由 + /api/health 自检 + 其余回退 index.html
  server/db/client.ts       TradingDB，所有 D1 SQL 都在这里
  server/db/schema.sql      表结构
  server/cache/index.ts     通用两级缓存（内存 + Cloudflare Cache API），与业务无关
  server/config/index.ts    读 env 生成 AppConfig
  server/services/stock/    行情服务：types(IStockProvider) / providers 注册表 / cached(缓存装饰器)
sw/sw.ts                    Service Worker 源码，由 scripts/build-sw.mjs 用 esbuild 打包
public/                     manifest.json、图标、_headers（缓存头）
```

## 关键约定

样式一律 CSS Modules + Less，**不允许行内 `style={{}}`**（`rg 'style=\{\{' app` 应为空）。主题色只用 `app/styles/tokens.less` 里的 CSS 自定义属性；间距圆角用 `variables.less` 的 Less 变量（`@gap-*`、`@radius-*`、mixin `.safe-area-top()`），该文件由 vite 的 `additionalData` 自动注入，无需 `@import`。

涨跌配色按中国习惯：**涨=红（`--pnl-up`）、跌=绿（`--pnl-down`）**。

主题支持深/浅切换，**默认深色**。`<html data-prefers-color-scheme>` 由 `root.tsx` 声明式渲染 + head 里的引导脚本 + `useLayoutEffect` 兜底，三处配合避免首屏闪白。

px 会被 `postcss-px-to-viewport-8-plugin` 转 vw；不想被转的元素（TabBar 等）加 `ignore-vw` 类名。

图标用 `lucide-react`。

## 服务端设计

`workers/app.ts` 里手写路由，不用框架。所有 `/api` 响应带 `Cache-Control: no-store`，业务异常统一 400 + `{error}`。缺行情凭证时搜索接口返回 503/502（**必须是非 2xx**，否则会被 SW 的 api-cache 当正常结果缓存并回放）。

行情数据源可插拔：实现 `IStockProvider` → 在 `services/stock/providers/index.ts` 注册表挂一行 → 用 `STOCK_PROVIDER` 环境变量切换。缓存在 `services/stock/cached.ts` 统一套一层，provider 自己不写缓存。缓存实现是 `server/cache/index.ts` 的 `createCache(namespace)`，L1 内存 Map + L2 `caches.default`，**只有 L2 跨 isolate 有效**（Workers 随时回收 isolate，光靠内存 Map 命中率不可控）。任何服务都能复用它。

TTL：`QUOTE_CACHE_TTL` 默认 600s，`SEARCH_CACHE_TTL` 默认 86400s。

取行情用的是 `items.symbol`（SQL 里 `i.symbol as item_symbol`），**不是** `items.name`（中文展示名）。这里曾经传错导致 `live_price` 恒为 null。

## PWA / 离线

`sw/sw.ts` 不用 `workbox-precaching` 的 `precacheAndRoute`（全有或全无，一个文件失败整个 SW 变 redundant），改成自己管预缓存：`install` 里 `Promise.allSettled` 逐个 `fetch(..., {cache:'reload'})` + `cache.put`，单个失败只告警。缓存名 `app-precache-<内容指纹>`，activate 时清同前缀旧版本。

离线外壳是 `/` 而不是 `/index.html`（Cloudflare 的 `html_handling` 会把 `/index.html` 301 到 `/`，而 `Cache.put` 拒绝重定向响应）。导航请求降级链：精确匹配 `/` → 忽略 query → `/index.html` → 网络 → `shellMissPage()`（自带诊断表格的兜底页，绝不把异常抛给浏览器，否则会被 Chrome 原生错误页掩盖）。

路由顺序敏感：`/__sw/status`（JSON 自检）→ 导航（denylist `/^\/api\//`）→ 预缓存产物 CacheFirst → `/api` GET NetworkFirst（3s 超时）→ 兜底同源静态 CacheFirst。**`/api` 刻意不用 StaleWhileRevalidate。**

SW 注册脚本内联在 `<head>`（`app/common/pwa/swBootstrap.ts`），不能放进 React effect —— SPA 下首屏 clientLoader 卡住就永远注册不上。

排查离线问题时注意：`Cmd+Shift+R` 强制刷新和 DevTools 的 Bypass for network 都会绕过 SW；明文 HTTP 下浏览器不注册 SW，只能在 HTTPS 或 localhost 验证。看到 Chrome 原生「您目前处于离线状态」而不是我们的兜底文案，说明请求没进 SW。

iOS standalone 布局：`apple-mobile-web-app-status-bar-style` 用 `black`（不用 `black-translucent`）；`body { position: fixed; inset: 0 }`；TabBar 的安全区 padding 只在 `@media (display-mode: standalone)` 下生效。

## 环境变量与部署

本地放 `.dev.vars`（已 gitignore）。线上 `FINNHUB_API_KEY` 必须在 Cloudflare Dashboard 建成 **Secret 类型**——`wrangler.json` 的 `vars` 会覆盖同名 Secret。验证：`curl -s https://域名/api/health`，看 `hasQuoteKey` / `stockProvider` / `db` / `tables` / `counts`。

D1 库名 `stock-storage`，`database_id` 是 `31f66cce-ebe7-473b-9da0-343f81a9aec5`。初始化本地库：`npx wrangler d1 execute stock-storage --local --file workers/server/db/schema.sql`。**不要动远端库。**

⚠️ 未解疑点：`wrangler.json` 的 `name` 是 `stock-record`，线上域名却是 `stock.rextao666.workers.dev`，且 `wrangler secret put` 报过「没有叫 stock-record 的 Worker」。多次出现「改了线上没变化」，怀疑用户访问的站点不是这个 Worker，尚未确认。

## 已知待办

- `package.json` 的 `typecheck` 脚本要修（`typegen` → `cf-typegen`）。
- `wrangler.json` 里模板残留的 `VALUE_FROM_CLOUDFLARE` 可删（牵动 `worker-configuration.d.ts`，删后重跑 `wrangler types`）。
- `README.md` 里明文写了 Finnhub API key，应删除并轮换该 key。
- `tokens.less` 的浅色令牌需真机微调（只改 `:root` 块）。

## 协作方式

改完跑 `npx tsc -b --force` + `npm run build`；浏览器和真机验证由用户自己做，**不要装 Playwright、不要起 CDP、不要写测试**。仓库常处于脏工作区，用户自己提交，**不要 `git reset`/`checkout --` 撤销别人的改动**。

## 本文件的维护规则

每次任务收尾时自查一遍：**这次改动有没有让上面任何一句话变成假话？** 有就改掉，这是唯一的硬性要求。

除此之外，下面这五类情况需要主动补内容：

1. 新增了目录、模块或跨页面复用的能力 —— 更新「目录地图」。只加一个页面文件不用写。
2. 定下了新约定或推翻了旧约定（样式写法、配色、命名、状态管理、错误处理口径）—— 更新「关键约定」。
3. 命令、脚本、环境变量、部署方式有变 —— 更新「命令」或「环境变量与部署」。
4. **踩坑后找到了反直觉的解法** —— 这条最值钱。写清「为什么不能用看起来更自然的那种写法」，否则下一个 AI 会顺手改回去，坑再踩一遍。
5. 出现查不下去的悬案 —— 记成 `⚠️ 未解疑点`，附上已经排除的可能性，避免下次重复排查。

反过来，**不要**往里写：具体函数签名和实现细节（读代码更准）、逐条改动记录（那是 git log 的活）、一次性的临时状态、能从 `package.json` 直接看出来的信息。这份文件的价值在于「不看会踩坑」，篇幅膨胀到两三百行以上 AI 就开始略读，反而不如现在有用。

已办完的「已知待办」直接删行，不要留「~~已完成~~」的痕迹。

**篇幅预算：本文件控制在 150 行以内。** 它每次会话都会被完整加载，膨胀就是持续的成本。
超出后不要继续往里堆，而是拆分：把某个专题（例如 PWA/离线、样式体系）移到 `docs/<主题>.md`，本文件只留三到五行结论 + 一句「细节见 docs/xxx.md」。
这样常驻上下文保持恒定，深水区的细节只在真正要动那块时才被读进来。

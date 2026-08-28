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
  common/                   layouts / components / hooks / theme(themeStore) / pwa(swBootstrap)
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
  server/services/stock/history/  历史日线（Yahoo），与报价链路互不相干
sw/sw.ts                    Service Worker 源码，由 scripts/build-sw.mjs 用 esbuild 打包
public/                     manifest.json、图标、_headers（缓存头）
```

## 关键约定

样式一律 CSS Modules + Less，**不允许行内 `style={{}}`**（`rg 'style=\{\{' app` 应为空）。主题色只用 `app/styles/tokens.less` 里的 CSS 自定义属性；间距圆角用 `variables.less` 的 Less 变量（`@gap-*`、`@radius-*`、mixin `.safe-area-top()`），该文件由 vite 的 `additionalData` 自动注入，无需 `@import`。

涨跌配色按中国习惯：**涨=红（`--pnl-up`）、跌=绿（`--pnl-down`）**。

主题支持深/浅切换，**默认深色**。`<html data-prefers-color-scheme>` 由 `root.tsx` 声明式渲染 + head 里的引导脚本 + `useLayoutEffect` 兜底，三处配合避免首屏闪白。

px 会被 `postcss-px-to-viewport-8-plugin` 转 vw；不想被转的元素（TabBar 等）加 `ignore-vw` 类名。

给 antd-mobile 组件改样式时，**单类选择器 + 直接写 `background-color` / `border` / `height` 会被组件自身样式吃掉**：antd 的样式表在运行时晚于路由 CSS 插入（build 产物的 manifest 里路由 css 排在 antd chunk 前面），同权重时后者胜出，表现是「颜色写了没生效」。做法是选择器多套一层父类抬权重，颜色尺寸优先用 antd 预留的 `--adm-<组件>-*` 变量（antd 自己从不声明它们，只在 `var()` 兜底链里读，不受插入顺序影响）。主按钮的实例见 `app/routes/trade/new.module.less` 的 `.actionBar .saveButton`，配色取 `--btn-primary-*` 令牌。确认类按钮一律用主按钮色，**不要借用涨跌绿**（那是「跌」的语义，放在确认按钮上会打架）。

图标用 `lucide-react`。

走势图（`app/features/stock-chart/components/PriceHistoryChart.tsx`）**刻意手绘 Canvas，不引图表库**：需求是自定义标注 —— 同方向成交按像素间距合并成 `B3`、圆点钉在真实成交价上、最近卖价的水平虚线、最后一笔卖出旁挂收益金额。lightweight-charts 的 marker 只能贴在 K 线上方/下方，**钉不到任意价格**（买入价通常不等于当日收盘价，点会飘），为拿它的手势要把标注自由度换掉。看日期靠点击标记出竖向辅助线 + 下方明细，不做 hover。**将来真要双指平移缩放再重新评估换库**，那部分自己写不划算。

移动端**纯数字字段一律用自绘键盘 `app/common/components/NumericKeypad.tsx`，不要用原生输入框**（参考 `app/routes/trade/new.tsx`）：iOS 上 input 一拿到焦点，WebKit 就会挂一条无法隐藏的表单辅助条，Chrome/Android 又没有，且软键盘弹收会改写 visualViewport 必然抖动。做法是单元格用 `<button>` 显示值 + 自绘光标，`onPointerDown` 里 `preventDefault` 阻止取得焦点。键盘尺寸走 `variables.less` 的 `@keypad-*`，让位的页面用 `@keypad-body-height` 算底部内边距。

自由文本（备注等）只能走系统键盘，但**要用 `app/common/components/PlainTextArea.tsx`，不要用 `textarea` / antd-mobile `TextArea`**：浏览器的自动填充只认表单控件，焦点落在 input/textarea 上时 Chrome 会挂「填支付卡等信息」建议条、iOS Safari 会挂表单辅助条，两者都在页面之外，CSS 和 `autoComplete="off"` 都管不住。contenteditable 不是表单控件，所以没有那条。代价是受控写回要避开光标跳动、粘贴要降级成纯文本、placeholder 不能只靠 `:empty`（删空后常留一个 `<br>`），这些都在组件里处理好了。真要用原生数字输入框时才用 `app/utils/numberInput.ts` 的 `DECIMAL_INPUT_PROPS` / `INTEGER_INPUT_PROPS` + sanitize 函数，**不要用 `type="number"`**：它会让 `inputMode` 失效。

## 服务端设计

`workers/app.ts` 里手写路由，不用框架。所有 `/api` 响应带 `Cache-Control: no-store`，业务异常统一 400 + `{error}`。缺行情凭证时搜索接口返回 503/502（**必须是非 2xx**，否则会被 SW 的 api-cache 当正常结果缓存并回放）。

行情数据源可插拔：实现 `IStockProvider` → 在 `services/stock/providers/index.ts` 注册表挂一行 → 用 `STOCK_PROVIDER` 环境变量切换。缓存在 `services/stock/cached.ts` 统一套一层，provider 自己不写缓存。缓存实现是 `server/cache/index.ts` 的 `createCache(namespace)`，L1 内存 Map + L2 `caches.default`，**只有 L2 跨 isolate 有效**（Workers 随时回收 isolate，光靠内存 Map 命中率不可控）。任何服务都能复用它。

TTL：`QUOTE_CACHE_TTL` 默认 600s，`SEARCH_CACHE_TTL` 默认 86400s，`HISTORY_CACHE_TTL` 默认 3600s。

历史行情（`GET /api/history/:symbol?range=5d|1mo|3mo|6mo|1y|ytd`）**走 Yahoo，不走 `STOCK_PROVIDER`**：Finnhub 免费档没有 candle 权限（`/stock/candle` 实测 403）。provider 在 `services/stock/history/yahoo.ts`，必须带浏览器 UA（不带会 429/403），是非公开接口、无 SLA，**本机 curl 通不代表 Workers 出口 IP 通，只能部署后验**，真被封就换 Twelve Data。区间与粒度的映射在 `app/features/stock-chart/types.ts` 的 `RANGE_INTERVALS`：`5d` 用 `60m`（配日线只有 5 个点，折线退化成直线段），其余日线；Yahoo 只认 `1d/5d/1mo/3mo/6mo/1y/2y/5y/10y/ytd/max`，**写 `1w` 不会报错、会静默降级成 1 天 1 个点**。日内点靠 `PriceCandle.t`（epoch ms）+ `PriceHistory.utcOffsetSeconds` 标成交易所当地时间，`date` 仍是当地交易日、买卖点按它对齐（同一天有多个点时落到当天最后一根）。空序列和上游异常一律 502 + `{error}`（中文文案，前端直接透出），这样 SW 的 api-cache 不会把空曲线缓存下来回放；`/api/history` 走 NetworkFirst 是**故意的**，离线能看上次那条曲线。走势图页面的买卖点不另开接口，复用 `/api/holdings/:id`：买点是 `trades.buy_time` + `current_price`（这个字段名是历史遗留，存的其实是**买入价**），卖点是 `sell_records`。

报价对外走 `IStockService.getQuote(symbol, {force})` 返回 `LiveQuote {price, fetchedAt, error}`（provider 仍只返回裸数字），缓存 key 是 `quote/v2/<SYMBOL>` —— 值形状变过，v2 用来甩掉 L2 里残留的旧纯数字。首页判断「数据旧了」用的是 `fetchedAt`（我们抓取的时刻），**不是行情自带时间戳**：休市期间价格本来不动，用后者会把所有标的常年标黄。手动刷新走 `GET /api/quotes/:symbol?refresh=1`（单标的粒度省 Finnhub 的 60 次/分钟额度，force 时先 invalidate 再回填），取不到价格返回 502。

失败的报价**刻意不写缓存**，所以首页下拉刷新只要重走一遍 loader 就自动是「好的用缓存、异常的重拉」，不需要给 `/api/holdings` 加 force 参数。

antd-mobile 的 `PullToRefresh` 把手势绑在自己的根节点上，而那个节点**只有内容高度**：内容不满一屏时（首页只有一张卡片）卡片下方的空白不在它里面，从空白处下拉没反应。修法是把它和内部 `.adm-pull-to-refresh-content` 一路 `flex:1` 撑满滚动区（见 `home.module.less` 的 `.scrollArea`），**别给它们加 `min-height:0`**，否则内容多时顶不高外层、`.main` 就不滚了。

取行情用的是 `items.symbol`（SQL 里 `i.symbol as item_symbol`），**不是** `items.name`（中文展示名）。这里曾经传错导致 `live_price` 恒为 null。

## PWA / 离线

`sw/sw.ts` 不用 `workbox-precaching` 的 `precacheAndRoute`（全有或全无，一个文件失败整个 SW 变 redundant），改成自己管预缓存：`install` 里 `Promise.allSettled` 逐个 `fetch(..., {cache:'reload'})` + `cache.put`，单个失败只告警。缓存名 `app-precache-<内容指纹>`，activate 时清同前缀旧版本。

离线外壳是 `/` 而不是 `/index.html`（Cloudflare 的 `html_handling` 会把 `/index.html` 301 到 `/`，而 `Cache.put` 拒绝重定向响应）。导航请求降级链：精确匹配 `/` → 忽略 query → `/index.html` → 网络 → `shellMissPage()`（自带诊断表格的兜底页，绝不把异常抛给浏览器，否则会被 Chrome 原生错误页掩盖）。

路由顺序敏感：`/__sw/status`（JSON 自检）→ 导航（denylist `/^\/api\//`）→ 预缓存产物 CacheFirst → `/api` GET NetworkFirst（3s 超时，**`/api/quotes` 除外，手动刷新不能被 3s 超时回放旧报价**）→ 兜底同源静态 CacheFirst。**`/api` 刻意不用 StaleWhileRevalidate。**

SW 注册脚本内联在 `<head>`（`app/common/pwa/swBootstrap.ts`），不能放进 React effect —— SPA 下首屏 clientLoader 卡住就永远注册不上。

排查离线问题时注意：`Cmd+Shift+R` 强制刷新和 DevTools 的 Bypass for network 都会绕过 SW；明文 HTTP 下浏览器不注册 SW，只能在 HTTPS 或 localhost 验证。看到 Chrome 原生「您目前处于离线状态」而不是我们的兜底文案，说明请求没进 SW。

移动端视口只有一套契约，改布局前先读 `app/common/viewport/viewportBootstrap.ts` 的注释。要点：`apple-mobile-web-app-status-bar-style` 用 `black`（不用 `black-translucent`，否则底部露系统底色）；外壳是 `body { position: fixed }`，高度取 visualViewport 实测的 `--app-viewport-height`（降级 `100dvh`），因为 `dvh` 和 `position:fixed` 都不响应软键盘；显示模式由 JS 写在 `html[data-display-mode]` 上（`@media (display-mode: standalone)` 在 iOS 桌面启动时会误判，`navigator.standalone` 才准）。

安全区一律用 `@safe-top` / `@safe-bottom`（即 `var(--safe-*)`）或 `.safe-area-top()` / `.safe-area-bottom()`。**不要在组件里再写 `env(safe-area-inset-*)` 或按显示模式分叉**：浏览器下底部工具栏已占住 home indicator，`--safe-bottom` 在 `global.less` 里被统一归零，只有独立窗口才是真实值。

聚焦输入框时的抖动源头及处置，别改回去：`viewportBootstrap` 的 sync 按帧合并且只在整像素变化时写 CSS 变量，并在 `focusin` 里 `window.scrollTo(0, 0)`（iOS 会上推 layout viewport，外壳是 fixed 本不该滚）；组件侧**不要无条件 `scrollIntoView`**，尤其别用 `block: 'center'`，要先判断是否真被浮层遮挡再用 `block: 'nearest'`。根治手段是数字字段干脆不弹系统键盘（见上文 `NumericKeypad`），视口高度恒定就没有抖动可言。

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

**先说方案，再动代码。** 收到修改需求时，先用几句话讲清「准备怎么改」和「为什么这么改」（涉及取舍就把备选方案和代价一并列出），等用户确认后再落地。只有用户明确说「直接改」「不用确认」时才跳过这一步；纯粹的问答、查代码、跑构建不受此约束。

这个确认环节要**短**：用户要的是「大致改哪儿」，不是技术细节。方案讲清取舍即可，实现细节留到代码里。

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

```
stock-record/
├── app/
│   ├── root.tsx                  # 根组件 (HTML 壳子、全局错误边界、Providers)
│   ├── routes.ts                 # 路由配置文件
│   │
│   ├── routes/                   # 【路由层】页面接入点（胶水层）
│   │   ├── _app.tsx              # 主布局路由 (包含 TabBar)
│   │   ├── home.tsx              # 首页路由
│   │   ├── chart.tsx             # 图表路由 (loader 处理 SSR/边缘数据，渲染 Feature)
│   │   └── mine.tsx              # 个人中心路由
│   │
│   ├── features/                 # 【核心业务领域】按业务高内聚
│   │   ├── stock-chart/          # 股票图表模块
│   │   │   ├── components/       # KLineChart, IndicatorToolbar 等
│   │   │   ├── hooks/            # useKLineWebSocket, useChartScale 等
│   │   │   ├── services/         # 本模块专用的请求/数据转换
│   │   │   ├── types.ts          # 本模块私有类型
│   │   │   └── index.ts          # 统一导出供 routes 或其他模块使用
│   │   ├── trade-record/         # 交易记录模块
│   │   └── user-profile/         # 用户/资产模块
│   │
│   ├── server/                   # 【服务端专用层】运行在 Cloudflare Workers
│   │   ├── db/                   # 数据库访问层
│   │   │   ├── client.server.ts  # D1/Prisma/Drizzle 客户端实例
│   │   │   └── schema.server.ts  # 表结构定义
│   │   ├── services/             # 复杂的服务端业务逻辑 (如数据计算、第三方行情抓取)
│   │   └── session.server.ts     # Cookie/Auth 认证会话管理
│   │
│   ├── common/                   # 【跨端/全局通用基础设施】
│   │   ├── components/           # 全局通用基础 UI 组件 (Button, Card, Modal, Empty)
│   │   ├── layouts/              # 骨架布局 (如 BasicLayout, SubPageLayout)
│   │   ├── request/              # 前端网络请求封装 (fetch/axios 拦截器、错误提示)
│   │   ├── store/                # 全局客户端状态 (Zustand / Jotai 等)
│   │   ├── utils/                # 纯工具函数 (formatMoney, calculateMA, dateHelper)
│   │   └── types/                # 全局共享 TS 类型 (如通用 API 响应接口 ApiResponse<T>)
│   │
│   └── styles/                   # 全局样式/主题变量
│
├── wrangler.jsonc / wrangler.toml# Cloudflare 配置文件 (配置 D1/KV 绑定)
└── tsconfig.json

```

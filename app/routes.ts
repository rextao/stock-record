import { type RouteConfig, layout, route, index } from "@react-router/dev/routes";

export default [
    layout("common/layouts/BasicLayout.tsx", [
        index("routes/home.tsx"),
        route("chart", "routes/chart.tsx"),
        route("profile", "routes/profile.tsx"),
    ]),

    route("items/manage", "routes/items/manage.tsx"),
    route("items/new", "routes/items/new.tsx"),


    route("trade/new", "routes/trade/new.tsx"),

    // 独立小工具：纯本地计算，不依赖任何接口
    route("tools/price-change", "routes/tools/price-change.tsx"),

    // 新增：持仓详情与单笔交易详情
    route("holdings/:id", "routes/holdings/detail.tsx"),
    route("trade/:id", "routes/trade/detail.tsx"),

] satisfies RouteConfig;

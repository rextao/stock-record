import { type RouteConfig, layout, route, index } from "@react-router/dev/routes";

export default [
    layout("common/layouts/BasicLayout.tsx", [
        index("routes/home.tsx"),
        route("chart", "routes/chart.tsx"),
        route("profile", "routes/profile.tsx"),
    ]),

    // --- 不带 TabBar 的独立二级页面 ---
    route("items/manage", "routes/items/manage.tsx"),
    route("items/new", "routes/items/new.tsx"),

] satisfies RouteConfig;

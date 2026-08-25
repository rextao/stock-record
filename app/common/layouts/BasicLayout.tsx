import { TabBar, SafeArea } from 'antd-mobile' // 👈 1. 引入 SafeArea
import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from 'react-router'
import { TAB_BAR_CONFIG, TAB_BAR_THEME } from './config/tabBarConfig'

export default function BasicLayout() {
    const navigate = useNavigate()
    const location = useLocation()

    const activeKey = location.pathname === '/' ? '/' : location.pathname.replace(/\/$/, '')

    // 👈 2. 注入全局深色模式，让所有弹窗/菜单变成高级黑
    useEffect(() => {
        document.documentElement.setAttribute('data-prefers-color-scheme', 'dark');
    }, []);

    return (
        // 👈 3. 将 height: '100vh' 改为 '100dvh' (Dynamic Viewport Height，完美适配 iOS)
        <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100%', backgroundColor: '#000000' }}>

            <main style={{ flex: 1, overflowY: 'auto', color: '#fff' }}>
                <Outlet />
            </main>

            <footer
                style={{
                    borderTop: '1px solid #1A1C24',
                    backgroundColor: TAB_BAR_THEME.backgroundColor,
                    // 👈 4. 删掉原先手写的 paddingBottom，交由 SafeArea 处理
                    zIndex: 100,
                }}
            >
                <TabBar
                    activeKey={activeKey}
                    onChange={(key) => navigate(key)}
                >
                    {TAB_BAR_CONFIG.map((item) => {
                        const Icon = item.icon
                        return (
                            <TabBar.Item
                                key={item.key}
                                badge={item.badge}
                                title={
                                    (active) => (
                                        <span style={{
                                            color: active ? TAB_BAR_THEME.activeColor : TAB_BAR_THEME.inactiveColor,
                                            fontSize: '11px',
                                            marginTop: '3px',
                                            display: 'block'
                                        }}>
                                            {item.title}
                                        </span>
                                    )
                                }
                                icon={(active) => (
                                    <Icon
                                        size={22}
                                        color={active ? TAB_BAR_THEME.activeColor : TAB_BAR_THEME.inactiveColor}
                                        strokeWidth={1.5}
                                    />
                                )}
                            />
                        )
                    })}
                </TabBar>

                {/* 👈 5. 在这里放置 SafeArea，它会自动垫高 iOS 底部的“小黑条”，并继承 footer 的背景色 */}
                <SafeArea position="bottom" />
            </footer>
        </div>
    )
}

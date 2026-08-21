import { TabBar } from 'antd-mobile'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { TAB_BAR_CONFIG, TAB_BAR_THEME } from './config/tabBarConfig'

export default function BasicLayout() {
    const navigate = useNavigate()
    const location = useLocation()

    // 规范化 pathname
    const activeKey = location.pathname === '/' ? '/' : location.pathname.replace(/\/$/, '')

    return (
        // 内容区域设为深色背景
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', backgroundColor: '#000000' }}>
            {/* 页面主视口，支持独立滚动 */}
            <main style={{ flex: 1, overflowY: 'auto', color: '#fff' }}>
                <Outlet />
            </main>

            {/* 底部导航区域，适配 iPhone 底部安全区，并应用深色背景 */}
            <footer
                style={{
                    borderTop: '1px solid #1A1C24', // 顶部细线也改为深色
                    backgroundColor: TAB_BAR_THEME.backgroundColor, // 使用配置的背景色
                    paddingBottom: 'env(safe-area-inset-bottom)',
                    zIndex: 100, // 确保在最上层
                }}
            >
                <TabBar
                    activeKey={activeKey}
                    onChange={(key) => navigate(key)}
                    // 这里的 activeKey 用于渲染逻辑，但文字颜色在 Item 级别精细控制
                >
                    {TAB_BAR_CONFIG.map((item) => {
                        const Icon = item.icon

                        return (
                            <TabBar.Item
                                key={item.key}
                                badge={item.badge}
                                title={
                                    // 在这里精细控制文字样式，确保未选中时也是深灰色
                                    (active) => (
                                        <span style={{
                                            color: active ? TAB_BAR_THEME.activeColor : TAB_BAR_THEME.inactiveColor,
                                            fontSize: '11px', // 移动端文字通常较小
                                            marginTop: '3px',
                                            display: 'block'
                                        }}>
                      {item.title}
                    </span>
                                    )
                                }
                                // 使用标准方式处理图标，图标稍大一些 (22px) 以匹配图片
                                icon={(active) => (
                                    <Icon
                                        size={22}
                                        color={active ? TAB_BAR_THEME.activeColor : TAB_BAR_THEME.inactiveColor}
                                        strokeWidth={1.5} // 微调图标线条粗细
                                    />
                                )}
                            />
                        )
                    })}
                </TabBar>
            </footer>
        </div>
    )
}

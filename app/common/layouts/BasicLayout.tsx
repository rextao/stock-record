import { TabBar } from 'antd-mobile'
import clsx from 'clsx'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { TAB_BAR_CONFIG } from './config/tabBarConfig'
import styles from './BasicLayout.module.less'

export default function BasicLayout() {
    const navigate = useNavigate()
    const location = useLocation()

    const activeKey = location.pathname === '/' ? '/' : location.pathname.replace(/\/$/, '')

    return (
        <div className={styles.layout}>
            <main className={styles.main}>
                <Outlet />
            </main>

            {/* ignore-vw：让 postcss-px-to-viewport 跳过这条 bar 的尺寸，见 BasicLayout.module.less */}
            <footer className={clsx(styles.footer, 'ignore-vw')}>
                <TabBar activeKey={activeKey} onChange={(key) => navigate(key)}>
                    {TAB_BAR_CONFIG.map((item) => {
                        const Icon = item.icon
                        return (
                            <TabBar.Item
                                key={item.key}
                                badge={item.badge}
                                title={(active) => (
                                    <span className={clsx(styles.tabTitle, active && styles.tabTitleActive)}>
                                        {item.title}
                                    </span>
                                )}
                                icon={(active) => (
                                    <span className={clsx(styles.tabIcon, active && styles.tabIconActive)}>
                                        <Icon size={22} strokeWidth={1.5} />
                                    </span>
                                )}
                            />
                        )
                    })}
                </TabBar>
            </footer>
        </div>
    )
}

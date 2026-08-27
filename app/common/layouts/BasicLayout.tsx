import { TabBar, SafeArea } from 'antd-mobile'
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

            <footer className={styles.footer}>
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

                {/* 自动垫高 iOS 底部小黑条，并继承 footer 背景色 */}
                <SafeArea position="bottom" />
            </footer>
        </div>
    )
}


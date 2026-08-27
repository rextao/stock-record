import { Home, LineChart, User } from 'lucide-react'
import type { TabBarItemConfig } from '~/common/types/navigation'

export const TAB_BAR_CONFIG: TabBarItemConfig[] = [
    {
        key: '/',
        title: '首页',
        icon: Home,
    },
    {
        key: '/chart',
        title: '图表',
        icon: LineChart,
    },
    {
        key: '/profile',
        title: '我的',
        icon: User,
    },
]

// TabBar 的配色已迁到 CSS 令牌：--tab-bg / --tab-active / --tab-inactive
// 见 app/styles/tokens.less 与 BasicLayout.module.less

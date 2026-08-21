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

// 根据图片调整的主题色
export const TAB_BAR_THEME = {
    // 底部栏整体背景色
    backgroundColor: '#0B0C11',
    // 激活状态下的紫色 (图标和文字)
    activeColor: '#BD83FF',
    // 未激活状态下的灰色 (图标和文字)
    inactiveColor: '#6D6F7E',
}

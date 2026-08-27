import { List, Selector } from 'antd-mobile'
import { useNavigate } from 'react-router'
import { ListTree, ChevronRight } from 'lucide-react'
import { useThemeStore, type ThemeMode } from '~/common/theme/themeStore'
import styles from './profile.module.less'

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
    { label: '深色', value: 'dark' },
    { label: '浅色', value: 'light' },
    { label: '跟随系统', value: 'system' },
]

export default function MineRoute() {
    const navigate = useNavigate()
    const themeMode = useThemeStore((s) => s.mode)
    const setThemeMode = useThemeStore((s) => s.setMode)

    return (
        <div className={styles.page}>
            <h2 className={styles.title}>我的</h2>

            <div className={styles.groupTitle}>数据管理</div>

            <List className={styles.card}>
                <List.Item
                    prefix={
                        <div className={styles.iconBox}>
                            <ListTree size={18} />
                        </div>
                    }
                    onClick={() => navigate('/items/manage')}
                    className={styles.listItem}
                    arrowIcon={<ChevronRight size={18} />}
                >
                    <span className={styles.itemLabel}>条目管理</span>
                </List.Item>
            </List>

            <div className={styles.groupTitle}>外观</div>

            <div className={styles.card}>
                <Selector
                    className={styles.themeSelector}
                    columns={3}
                    options={THEME_OPTIONS}
                    value={[themeMode]}
                    onChange={(value) => {
                        if (value.length) setThemeMode(value[0])
                    }}
                />
            </div>
        </div>
    )
}


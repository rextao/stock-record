import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import styles from './EmptyState.module.less';

interface Props {
    icon: LucideIcon;
    title: string;
    description?: string;
    /** 顶部留白收紧一档，用于已有 NavBar 的页面 */
    compact?: boolean;
}

/** 首页 / 图表 / 条目管理共用的空状态占位 */
export function EmptyState({ icon: Icon, title, description, compact }: Props) {
    return (
        <div className={clsx(styles.empty, compact && styles.compact)}>
            <span className={styles.icon}>
                <Icon size={56} />
            </span>
            <div className={styles.title}>{title}</div>
            {description && <div className={styles.description}>{description}</div>}
        </div>
    );
}


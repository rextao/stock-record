import { Plus } from 'lucide-react';
import clsx from 'clsx';
import styles from './FloatingActionButton.module.less';

interface Props {
    onClick: () => void;
    /** 页面底部有 TabBar 时抬高按钮位置 */
    aboveTabBar?: boolean;
    'aria-label'?: string;
}

/** 右下角悬浮新增按钮 */
export function FloatingActionButton({ onClick, aboveTabBar, ...rest }: Props) {
    return (
        <div
            role="button"
            aria-label={rest['aria-label'] ?? '新增'}
            className={clsx(styles.fab, aboveTabBar && styles.aboveTabBar)}
            onClick={onClick}
        >
            <Plus size={28} />
        </div>
    );
}


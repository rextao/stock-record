import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { NavBar, Dialog, Toast } from "antd-mobile";
import { ChevronRight, Trash2, ListTree } from "lucide-react";
import { EmptyState } from "../../common/components/EmptyState";
import { FloatingActionButton } from "../../common/components/FloatingActionButton";
import { deleteItem, fetchItems } from "../../api/trading";
import type { ItemWithUsage } from "../../features/trade-record/types";
import styles from "./manage.module.less";

// ==========================================
// 1. 客户端数据逻辑（请求 Worker 上的 /api）
// ==========================================

export async function clientLoader({ request }: { request: Request }) {
    return fetchItems({ signal: request.signal });
}

export async function clientAction({ request }: { request: Request }) {
    const formData = await request.formData();
    const intent = formData.get("intent");
    const id = Number(formData.get("id"));

    if (intent === "delete" && id) {
        try {
            return await deleteItem(id);
        } catch (error: any) {
            return { error: error.message as string };
        }
    }

    return { error: "未知操作" };
}

// ==========================================
// 2. 客户端 UI 组件
// ==========================================

export default function ItemsManageRoute() {
    const navigate = useNavigate();
    // 拿到 loader 返回的数据
    const { items } = useLoaderData<typeof clientLoader>();
    // fetcher 用于在不引起页面完整刷新的情况下提交 action (比如删除)
    const fetcher = useFetcher();

    // 执行删除逻辑
    // 删除是硬删除 + 级联清空，也没有回收站，所以弹窗至少要报出会牵连多少条记录
    const handleDelete = (item: ItemWithUsage) => {
        const tradeCount = item.trade_count ?? 0;

        Dialog.confirm({
            title: '删除条目',
            content: (
                <div className={styles.confirmBody}>
                    <div>确定删除「{item.name}」吗？</div>
                    {tradeCount > 0 && (
                        <div className={styles.confirmDanger}>
                            {tradeCount} 笔交易记录会一起删除，无法恢复。
                        </div>
                    )}
                </div>
            ),
            confirmText: <span className={styles.dangerText}>删除</span>,
            onConfirm: async () => {
                fetcher.submit(
                    { intent: "delete", id: item.id.toString() },
                    { method: "post" }
                );
                Toast.show({ icon: 'success', content: '删除成功' });
            },
        });
    };

    return (
        <div className={styles.page}>
            <NavBar onBack={() => navigate(-1)} className={styles.navBar}>
                条目管理
            </NavBar>

            <div className={styles.content}>
                {items.length === 0 ? (
                    <EmptyState
                        compact
                        icon={ListTree}
                        title="暂无条目"
                        description="点击右下角「＋」添加投资标的"
                    />
                ) : (
                    <div className={styles.list}>
                        {items.map((item: ItemWithUsage) => (
                            <div key={item.id} className={styles.row}>
                                {/* 左侧点击进入编辑 */}
                                <div
                                    className={styles.rowMain}
                                    // 列表数据直接带过去，编辑页就不用再查一次
                                    onClick={() => navigate(`/items/edit/${item.id}`, { state: { item } })}
                                >
                                    <div className={styles.rowText}>
                                        <span className={styles.rowName}>{item.name}</span>
                                        <span className={styles.rowMeta}>
                                            {item.symbol?.trim() || '未登记代码'} · {item.trade_count ?? 0} 笔记录
                                        </span>
                                    </div>
                                    <span className={styles.rowArrow}>
                                        <ChevronRight size={20} />
                                    </span>
                                </div>

                                {/* 右侧删除按钮 */}
                                <div className={styles.deleteButton} onClick={() => handleDelete(item)}>
                                    <Trash2 size={20} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <FloatingActionButton aria-label="新增条目" onClick={() => navigate('/items/new')} />
        </div>
    )
}
